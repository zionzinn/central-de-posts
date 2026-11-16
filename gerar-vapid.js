// v4.28: gera as chaves dos lembretes no celular (Web Push / VAPID). Rodar UMA vez no PC: node gerar-vapid.js
// Grava o arquivo vapid-NAO-SUBIR.txt na pasta de CIMA do projeto (fora do git). Abra o arquivo, copie as 3 linhas pro
// Render (Environment: VAPID_PUBLICA, VAPID_PRIVADA, VAPID_EMAIL) e salve. A chave privada nunca vai pro chat nem pro git.
// Trocar as chaves depois faz todo mundo precisar ligar os lembretes de novo no celular.
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jp = publicKey.export({ format: 'jwk' }), jk = privateKey.export({ format: 'jwk' });
const pub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jp.x, 'base64'), Buffer.from(jp.y, 'base64')]));
const pri = b64u(Buffer.from(jk.d, 'base64'));
const alvo = path.join(__dirname, '..', 'vapid-NAO-SUBIR.txt');
if (fs.existsSync(alvo)) { console.log('Já existe ' + alvo + ' (não sobrescrevi). Apague o arquivo se quiser gerar chaves novas.'); process.exit(0); }
fs.writeFileSync(alvo, 'VAPID_PUBLICA=' + pub + '\nVAPID_PRIVADA=' + pri + '\nVAPID_EMAIL=mailto:zion.bagatoli@seubone.com\n', { mode: 0o600 });
console.log('Pronto. As chaves estão em: ' + alvo);
console.log('Cole as 3 linhas no Render (Environment) e salve. Chave pública: ' + pub);
