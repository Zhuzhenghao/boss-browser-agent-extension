export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

export async function parseRequestBody(req) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  return await new Promise((resolve, reject) => {
    req.on('end', () => {
      try {
        const parsed = JSON.parse(
          Buffer.concat(chunks).toString('utf8') || '{}',
        );
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
