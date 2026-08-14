import { normalizeEvidenceCard } from './evidence-card.mjs';

function cloneState(state) {
  return { ...state, projects: [...(state.projects || [])], archive: [...(state.archive || [])], outbox: [...(state.outbox || [])] };
}

function projectName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Project name is required.');
  return name.slice(0, 120);
}

function requireUniqueProjectName(projects, name, ignoredId = '') {
  const normalized = name.toLocaleLowerCase();
  if ((projects || []).some((project) => project.id !== ignoredId && projectName(project.name).toLocaleLowerCase() === normalized)) {
    throw new Error('Project name already exists.');
  }
}

function requireProject(state, projectId) {
  if (!state.projects.some((project) => project.id === projectId)) throw new Error('Selected project does not exist.');
}

export function createProject(state, project) {
  const next = cloneState(state);
  const id = String(project?.id || '').trim();
  if (!id) throw new Error('Project id is required.');
  if (next.projects.some((candidate) => candidate.id === id)) throw new Error('Project already exists.');
  const name = projectName(project.name);
  requireUniqueProjectName(next.projects, name);
  next.projects.push({ id, name, createdAt: project.createdAt || null });
  return next;
}

export function deleteProject(state, projectId, { moveToUnfiled } = {}) {
  const id = String(projectId || '').trim();
  if (id === 'unfiled') throw new Error('Unfiled cannot be deleted.');
  requireProject(state, id);
  if (moveToUnfiled !== true) throw new Error('Deleting a project requires moveToUnfiled confirmation.');
  const next = cloneState(state);
  next.projects = next.projects.filter((project) => project.id !== id);
  next.archive = next.archive.map((card) => card.projectId === id ? normalizeEvidenceCard({ ...card, projectId: 'unfiled' }) : card);
  next.outbox = next.outbox.map((item) => item.record?.projectId === id ? { ...item, record: normalizeEvidenceCard({ ...item.record, projectId: 'unfiled' }) } : item);
  return next;
}

export function renameProject(state, projectId, name) {
  const id = String(projectId || '').trim();
  if (id === 'unfiled') throw new Error('Unfiled cannot be renamed.');
  requireProject(state, id);
  const next = cloneState(state);
  const nextName = projectName(name);
  requireUniqueProjectName(next.projects, nextName, id);
  next.projects = next.projects.map((project) => project.id === id ? { ...project, name: nextName } : project);
  return next;
}

export function updateCardMetadata(state, cardId, metadata) {
  const next = cloneState(state);
  const index = next.archive.findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error('Evidence card was not found.');
  const projectId = String(metadata?.projectId || '').trim();
  requireProject(next, projectId);
  const current = next.archive[index];
  const updated = normalizeEvidenceCard({ ...current, projectId, tags: metadata?.tags, note: metadata?.note });
  next.archive[index] = updated;
  next.outbox = next.outbox.map((item) => item.record?.id === cardId ? { ...item, record: updated } : item);
  return next;
}
