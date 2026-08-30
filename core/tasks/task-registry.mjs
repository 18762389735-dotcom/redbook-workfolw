import { randomUUID } from 'node:crypto';
// Small, independent task state model for local collectors. No global Agent lock is used.
export class TaskRegistry { constructor() { this.tasks = new Map(); } create(kind) { const task = { id: randomUUID(), kind, status: 'queued', createdAt: new Date().toISOString() }; this.tasks.set(task.id, task); return task; } setStatus(id, status) { const task = this.tasks.get(id); if (!task) return null; task.status = status; task.updatedAt = new Date().toISOString(); return task; } }
