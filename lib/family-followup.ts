import { DateTime } from "luxon";
import { type Actor, profileFor } from "./auth";
import { one } from "./db";
import { ZONE } from "./time";

export type FamilyFollowup = {
  invited: number;
  answered: number;
  unanswered: number;
  pending: number;
  accepted: number;
  lastContact: {
    id: string;
    at: string;
    status: string;
    simulated: number;
  } | null;
  nextContact: { at: string } | null;
};

export function familyFollowup(
  actor: Actor,
  instant: string,
  tasks: readonly { status: string; created_at: string }[],
): FamilyFollowup | null {
  if (actor.role !== "relative") return null;
  const profile = profileFor(actor);
  if (
    !one(
      "SELECT 1 FROM consents WHERE care_profile_id=? AND scope='family_updates' AND recipient_id=? AND revoked_at IS NULL",
      profile.id,
      actor.id,
    )
  )
    return null;

  const today = DateTime.fromISO(instant).setZone(ZONE).startOf("day");
  const start = today.minus({ days: 6 }).toUTC().toISO()!;
  const end = today.plus({ days: 1 }).toUTC().toISO()!;
  // Count only this relative's invitations. Outcomes need a record explicitly
  // shared with that relative, not the broader routine-run snapshot.
  const counts = one<
    Pick<FamilyFollowup, "invited" | "answered" | "unanswered">
  >(
    `SELECT COUNT(*) AS invited,
      COUNT(CASE WHEN rr.status='answered' THEN 1 END) AS answered,
      COUNT(CASE WHEN rr.status='unanswered' THEN 1 END) AS unanswered
     FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id
     WHERE r.care_profile_id=? AND r.created_by=?
       AND rr.scheduled_at>=? AND rr.scheduled_at<?
       AND (rr.status='invited' OR (
         rr.status IN ('answered','unanswered') AND EXISTS (
           SELECT 1 FROM care_events e
           WHERE e.routine_run_id=rr.id AND e.care_profile_id=r.care_profile_id
             AND e.visibility_scope='family' AND e.recipient_id=?
             AND e.event_type=CASE WHEN rr.status='answered' THEN 'checkin' ELSE 'unanswered' END
         )
       ))`,
    profile.id,
    actor.id,
    start,
    end,
    actor.id,
  )!;
  const createdThisWeek = tasks.filter(
    (t) => t.created_at >= start && t.created_at < end,
  );
  const lastContact =
    one<NonNullable<FamilyFollowup["lastContact"]>>(
      `SELECT id,event_time AS at,evidence_type AS status,simulated
     FROM care_events
     WHERE care_profile_id=? AND visibility_scope='family' AND recipient_id=?
       AND event_type IN ('checkin','unanswered') AND event_time>=? AND event_time<?
     ORDER BY event_time DESC,created_at DESC,rowid DESC LIMIT 1`,
      profile.id,
      actor.id,
      start,
      end,
    ) ?? null;
  const nextContact =
    one<NonNullable<FamilyFollowup["nextContact"]>>(
      `SELECT next_run_at AS at FROM routines
     WHERE care_profile_id=? AND created_by=? AND enabled=1 AND cancelled_at IS NULL
       AND next_run_at>=?
       AND EXISTS (SELECT 1 FROM consents c WHERE c.care_profile_id=routines.care_profile_id
         AND c.scope='checkins' AND c.recipient_id IS NULL AND c.revoked_at IS NULL)
     ORDER BY next_run_at,id LIMIT 1`,
      profile.id,
      actor.id,
      instant,
    ) ?? null;
  return {
    ...counts,
    pending: createdThisWeek.filter((t) => t.status === "pending").length,
    accepted: createdThisWeek.filter((t) => t.status === "accepted").length,
    lastContact,
    nextContact,
  };
}
