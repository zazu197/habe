import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mediaUrl,safePath,equalToken } from '../companion/security.mjs';
test('URL parsing rejects localhost, credentials, nonmedia paths and Spotify',()=>{
  assert.equal(mediaUrl('https://youtu.be/abcdefghijk?x=1'),'https://www.youtube.com/watch?v=abcdefghijk');
  for(const value of ['http://youtube.com/watch?v=abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://user@youtube.com/watch?v=abcdefghijk','https://127.0.0.1/a','https://open.spotify.com/track/a','--exec=evil','https://youtube.com/watch?v=bad'])assert.throws(()=>mediaUrl(value));
});
test('paths cannot escape configured root',()=>{const root=path.resolve('work/test-root');assert.throws(()=>safePath(root,'../secret'));assert.throws(()=>safePath(root,'a\\b'));assert.throws(()=>safePath(root,'x\0y'));assert.equal(safePath(root,'safe.mp3'),path.join(root,'safe.mp3'));});
test('pairing token requires exact constant-time equality',()=>{assert.equal(equalToken('abc','abc'),true);assert.equal(equalToken('ab','abc'),false);assert.equal(equalToken('abd','abc'),false);});
