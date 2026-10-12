import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { configuration, dataDir } from '../companion/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const spicetify=process.platform==='win32'?path.join(process.env.APPDATA,'spicetify'):path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'spicetify');
const config=path.join(spicetify,'config-xpui.ini'), backup=path.join(dataDir,'spicetify-backup'), target=path.join(spicetify,'CustomApps','riffify');
const run=args=>{const result=spawnSync('spicetify',args,{encoding:'utf8',windowsHide:true});writeFileSync(path.join(dataDir,'last-install.log'),String(result.stdout||'')+String(result.stderr||''));if(result.error || result.status!==0)throw new Error(`Spicetify ${args.join(' ')} failed; inspect local last-install.log; backup is ${backup}`);console.log(`Spicetify ${args.join(' ')} succeeded`);};
if(process.argv.includes('--uninstall')) {
  if(!existsSync(path.join(backup,'config-xpui.ini')))throw new Error('Riffify installation backup not found');
  const previous=readFileSync(path.join(backup,'config-xpui.ini'),'utf8');
  const current=readFileSync(config,'utf8');
  // Restore only fields that Riffify changes, preserving later unrelated customization.
  const field=(text,name)=>text.match(new RegExp(`^${name}\\s*=\\s*(.*)$`,'m'))?.[1]?.trim()||'';
  const update=(text,name,value)=>text.replace(new RegExp(`^${name}\\s*=.*$`,'m'),`${name} = ${value}`);
  writeFileSync(config,update(current,'custom_apps',field(current,'custom_apps').split('|').filter(x=>x.trim()!=='riffify').join('|')));
  if(existsSync(target)) { const absolute=path.resolve(target); if(!absolute.startsWith(path.resolve(spicetify,'CustomApps')+path.sep))throw new Error('Unsafe uninstall target'); rmSync(absolute,{recursive:true}); }
  run(['apply']); console.log('Riffify removed. Listening history remains private and can be deleted separately.');
} else {
  if(!existsSync(path.join(root,'dist/spicetify/riffify/index.js')))throw new Error('Run npm run build first');
  if(!existsSync(config))throw new Error('Install Spicetify first');
  const text=readFileSync(config,'utf8');
  if(!existsSync(backup)) {
    mkdirSync(backup,{recursive:true}); cpSync(config,path.join(backup,'config-xpui.ini'));
    const spotify=text.match(/^spotify_path\s*=\s*(.*)$/m)?.[1]?.trim();
    if(spotify && existsSync(path.join(spotify,'Apps')))cpSync(path.join(spotify,'Apps'),path.join(backup,'Apps'),{recursive:true});
  }
  if(existsSync(target) && !existsSync(path.join(target,'.riffify-managed')))throw new Error('Existing unmanaged riffify app; preserve it before installing');
  const alreadyInstalled=existsSync(path.join(target,'.riffify-managed'));
  mkdirSync(target,{recursive:true});cpSync(path.join(root,'dist/spicetify/riffify'),target,{recursive:true});writeFileSync(path.join(target,'.riffify-managed'),'1');
  const local=configuration();
  writeFileSync(path.join(target,'connection.js'),`window.RiffifyConnection = ${JSON.stringify({origin:`http://127.0.0.1:${local.port}`,token:local.token})};\n`,{mode:0o600});
  run(['config','custom_apps','riffify']);
  // Spicetify validates backup and patch compatibility itself. Never overwrite or force a failed patch.
  run(alreadyInstalled?['apply']:['backup','apply']);
  console.log('Installed Riffify. Start companion with npm start. Backup is outside the repository.');
}
