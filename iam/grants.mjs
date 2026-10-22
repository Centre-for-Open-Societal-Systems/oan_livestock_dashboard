// Add one client role without altering user identities, credentials or other roles.
export async function resolveGrantUsers(api, usernames, realm) {
  const users = []
  for (const username of new Set(usernames)) {
    const matches = await api("GET", `/users?username=${encodeURIComponent(username)}&exact=true`)
    if (!Array.isArray(matches) || matches.length !== 1 || !matches[0].id ||
        matches[0].username !== username || matches[0].serviceAccountClientId) {
      throw new Error(`Requested user ${username} must resolve to exactly one staff user in realm ${realm}`)
    }
    users.push(matches[0])
  }
  return users
}

export async function grantRole(api, userId, clientId, role) {
  const path = `/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientId)}`
  const before = await api("GET", path)
  if (!Array.isArray(before) || !role?.id) throw new Error("Cannot verify existing client role mappings")
  if (!before.some(existing => existing.id === role.id)) await api("POST", path, [role])
  const after = await api("GET", path)
  if (!Array.isArray(after) || ![...before, role].every(expected => after.some(actual => actual.id === expected.id))) {
    throw new Error("Client role grant verification failed or an existing role was removed")
  }
}
