import { json, readJsonBody } from './http-json.mjs';

export function createAccountApiHandler(accountStore) {
  return async (request, response) => {
    try {
      if (request.method === 'GET') return json(response, 200, await accountStore.get());
      if (request.method === 'PUT') return json(response, 200, await accountStore.update(await readJsonBody(request)));
      return json(response, 405, { error: '不支持的请求方法' });
    } catch (error) {
      return json(response, 400, { error: error.message || '账号资料保存失败' });
    }
  };
}
