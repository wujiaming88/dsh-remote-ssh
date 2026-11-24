// A connection-test result belongs to the exact connection configuration, not
// merely its editable profile id. Remounting on these changes also invalidates
// the old row's pending useRequest callbacks through its normal cleanup.
export function connectionRowKey(profile) {
  return JSON.stringify([profile.id,profile.host,profile.user,profile.port,
    profile.authMethod,profile.keyPath||'',profile.proxyJump||'']);
}
