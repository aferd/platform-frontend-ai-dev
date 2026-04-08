export async function fetchStats() {
  return (await fetch('/api/stats')).json();
}

export async function fetchBotStatus() {
  return (await fetch('/api/bot-status')).json();
}

export async function fetchTasks(params: { status?: string; exclude_status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.exclude_status) qs.set('exclude_status', params.exclude_status);
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  return (await fetch('/api/tasks?' + qs)).json();
}

export async function deleteTask(jiraKey: string) {
  return fetch('/api/tasks/' + encodeURIComponent(jiraKey), { method: 'DELETE' });
}

export async function unarchiveTask(jiraKey: string) {
  return fetch('/api/tasks/' + encodeURIComponent(jiraKey) + '/unarchive', { method: 'POST' });
}

export async function fetchMemories(params: { category?: string; repo?: string; tag?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.repo) qs.set('repo', params.repo);
  if (params.tag) qs.set('tag', params.tag);
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  return (await fetch('/api/memories?' + qs)).json();
}

export async function fetchMemory(id: number) {
  return (await fetch('/api/memories/' + id)).json();
}

export async function deleteMemory(id: number) {
  return fetch('/api/memories/' + id, { method: 'DELETE' });
}

export async function searchMemories(query: string, params?: { category?: string; repo?: string; tag?: string; limit?: number }) {
  const qs = new URLSearchParams({ q: query });
  if (params?.category) qs.set('category', params.category);
  if (params?.repo) qs.set('repo', params.repo);
  if (params?.tag) qs.set('tag', params.tag);
  if (params?.limit) qs.set('limit', String(params.limit));
  return (await fetch('/api/memories/search?' + qs)).json();
}

export async function fetchTags() {
  return (await fetch('/api/tags')).json();
}

export async function fetchEmbeddings() {
  return (await fetch('/api/memories/embeddings')).json();
}

export async function fetchCosts(days = 30, limit = 200) {
  return (await fetch(`/api/costs?days=${days}&limit=${limit}`)).json();
}
