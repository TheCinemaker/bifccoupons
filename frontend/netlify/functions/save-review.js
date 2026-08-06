const https = require('https');

const REPO_OWNER = 'TheCinemaker';
const REPO_NAME = 'bifccoupons';

function githubApiRequest(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
      method: method,
      headers: {
        'User-Agent': 'KINABOLVEDDMEG-Netlify-Function',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { pin, reviews } = payload;

    if (pin !== '0169') {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid PIN' })
      };
    }

    if (!Array.isArray(reviews)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid reviews data' })
      };
    }

    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!ghToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GITHUB_TOKEN environment variable not set on server' })
      };
    }

    const jsonContent = JSON.stringify(reviews, null, 2);
    const base64Content = Buffer.from(jsonContent, 'utf-8').toString('base64');

    const pathsToUpdate = [
      'frontend/public/reviews.json',
      'frontend/src/data/reviews.json'
    ];

    for (const path of pathsToUpdate) {
      const getRes = await githubApiRequest(path, 'GET', null, ghToken);
      let sha = undefined;
      if (getRes.status === 200 && getRes.data && getRes.data.sha) {
        sha = getRes.data.sha;
      }

      const putRes = await githubApiRequest(path, 'PUT', {
        message: 'Update reviews.json via KÍNÁBÓLVEDDMEG Admin UI - Auto Deploy',
        content: base64Content,
        sha: sha,
        branch: 'main'
      }, ghToken);

      if (putRes.status !== 200 && putRes.status !== 201) {
        return {
          statusCode: putRes.status,
          body: JSON.stringify({ error: `Failed updating ${path}: ` + JSON.stringify(putRes.data) })
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'JSON successfully committed to GitHub main. Netlify deploy started!' })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
