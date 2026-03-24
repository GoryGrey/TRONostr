import * as http from 'http';

const port = Number(process.env.PORT || 8787);

const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/tronostr') {
        res.statusCode = 404;
        res.end('not found');
        return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        try {
            const payload = JSON.parse(body);
            console.log('[webhook] received', JSON.stringify(payload, null, 2));
            res.statusCode = 202;
            res.end('accepted');
        } catch (error) {
            console.error('[webhook] invalid payload', error);
            res.statusCode = 400;
            res.end('invalid json');
        }
    });
});

server.listen(port, () => {
    console.log(`[webhook] listening on http://127.0.0.1:${port}/tronostr`);
});
