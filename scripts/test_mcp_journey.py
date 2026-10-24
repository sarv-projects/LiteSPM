import os,json,tempfile,subprocess,pathlib,threading,http.server,functools,sys
repo=pathlib.Path(__file__).resolve().parents[1]
cli=str(pathlib.Path(sys.argv[1]).resolve()) if len(sys.argv)>1 else str(repo/'dist/litespm')
with tempfile.TemporaryDirectory(prefix='litespm-mcp-audit-') as temp:
 root=pathlib.Path(temp);env=os.environ.copy();env.update({f'LITESPM_{k}_ROOT':str(root/k.lower()) for k in ['DATA','CONFIG','RUNTIME']})
 row=next(r for r in json.loads((repo/'web/data/catalog.json').read_text()) if r['id']=='mcp:builtin:mcp-registry:io.github.github-github-mcp-server')
 (root/'dataset.json').write_text(json.dumps([row]));site=root/'site';project=root/'project';(project/'.codex').mkdir(parents=True)
 before='model = "audit-model"\n\n[mcp_servers.keep]\ncommand = "echo"\nargs = ["keep"]\n';cfg=project/'.codex/config.toml';cfg.write_text(before)
 def run(args,input=None):
  p=subprocess.run([cli,*args],env=env,cwd=project,text=True,input=input,capture_output=True,timeout=90)
  print('$ litespm '+' '.join(args));print(p.stdout);print(p.stderr)
  if p.returncode: raise RuntimeError('command failed '+str(p.returncode))
  return p.stdout
 run(['catalog','build','--dataset',str(root/'dataset.json'),'--out',str(site),'--release-id','rel-audit-local-001'])
 class Quiet(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*a):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
 threading.Thread(target=server.serve_forever,daemon=True).start();env['LITESPM_REGISTRY_URL']='http://127.0.0.1:'+str(server.server_port)
 try:
  run(['catalog','sync']);run(['search','github']);run(['install',row['id'],'--host','codex','--workspace',str(project)],'y\n')
  assert cfg.read_text()!=before and 'keep' in cfg.read_text(),'install did not preserve unrelated config'
  inventory=run(['list','--project',str(project),'--json']);(root/'inventory.json').write_text(inventory)
  install_id=json.loads(inventory)['records'][0]['installId']
  run(['install','remove',install_id],'y\n')
  import tomllib
  after_remove=tomllib.loads(cfg.read_text())
  assert 'github' not in after_remove['mcp_servers'] and 'keep' in after_remove['mcp_servers'], 'removal affected unrelated configuration'
  prior=cfg.read_bytes()
  run(['install',row['id'],'--host','codex','--workspace',str(project)],'y\n')
  run(['restore',install_id],'y\n')
  assert cfg.read_bytes()==prior, 'restore did not recover exact pre-install bytes'
  print('PASS: catalog build/sync/search, actual MCP install/list/remove and byte-exact restore; unrelated configuration preserved')
 finally:server.shutdown()
