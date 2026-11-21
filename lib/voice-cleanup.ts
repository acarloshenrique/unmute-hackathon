export type VoiceResources = {
  closeMicrophone: () => void;
  destroyToolkit: () => void;
  leaveRtc: () => Promise<unknown>;
  logoutRtm: () => Promise<unknown>;
  stopAgent: () => Promise<unknown>;
};
export function makeCleanup(resources: VoiceResources) {
  let pending: Promise<string[]> | undefined;
  return () => {
    if (pending) return pending;
    pending = (async () => {
      const failed: string[] = [];
      for (const name of ["closeMicrophone", "destroyToolkit"] as const) {
        try {
          resources[name]();
        } catch {
          failed.push(name);
        }
      }
      await Promise.all(
        (["leaveRtc", "logoutRtm", "stopAgent"] as const).map(async (name) => {
          try {
            await resources[name]();
          } catch {
            failed.push(name);
          }
        }),
      );
      return failed;
    })();
    return pending;
  };
}
