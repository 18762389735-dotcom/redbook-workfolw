import { json, readJsonBody } from './http-json.mjs';

export function createAccountApiHandler(accountStore, { signalStore } = {}) {
  return async (request, response) => {
    try {
      const pathname = request.url?.split('?')[0] || '/api/account';
      if (request.method === 'GET' && pathname === '/api/account') return json(response, 200, await accountStore.get());
      if (request.method === 'PUT' && pathname === '/api/account') return json(response, 200, await accountStore.update(await readJsonBody(request)));
      if (request.method === 'POST' && pathname === '/api/account/xhs-sync') {
        const body = await readJsonBody(request);
        if (!body?.facts || typeof body.facts !== 'object') return json(response, 400, { error: '缺少小红书主页公开资料' });
        const profile = await accountStore.syncXhsProfile(body.facts, {
          notes: Array.isArray(body.recentNotes)
            ? body.recentNotes
            : signalStore
              ? (await signalStore.list()).filter((signal) => signal.author?.id && signal.author.id === String(body.facts.xhsId || body.facts.userId || '').trim()).slice(0, 50)
              : [],
        });
        const analyzed = await accountStore.analyzeXhsProfile();
        return json(response, 200, { success: true, profile: analyzed, facts: analyzed.facts, analysis: analyzed.profileAnalysis });
      }
      if (request.method === 'POST' && pathname === '/api/account/analyze') {
        return json(response, 200, { success: true, profile: await accountStore.analyzeXhsProfile() });
      }
      return json(response, 405, { error: '不支持的请求方法' });
    } catch (error) {
      return json(response, 400, { error: error.message || '账号资料保存失败' });
    }
  };
}
