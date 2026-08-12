export function withProjectNameForDelivery(record, projects) {
  const projectId = String(record?.projectId || 'unfiled');
  const project = (Array.isArray(projects) ? projects : []).find((item) => item.id === projectId);
  return { ...record, projectName: String(project?.name || projectId || 'Unfiled') };
}
