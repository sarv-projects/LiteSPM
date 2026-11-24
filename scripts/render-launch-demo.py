"""Render the illustrated workflow (not a terminal recording)."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
dest=root/"web/public/demo"
dest.mkdir(parents=True,exist_ok=True)
docs=root/"docs/assets"
docs.mkdir(parents=True,exist_ok=True)
fontroot=Path("C:/Windows/Fonts")
def font(name,size):
    try: return ImageFont.truetype(str(fontroot/name),size)
    except OSError: return ImageFont.load_default(size=size)
title=font("segoeuib.ttf",36); normal=font("segoeui.ttf",23); small=font("segoeui.ttf",18); mono=font("consola.ttf",21); bold=font("segoeuib.ttf",22)
scenes=[
("01  Discover","Find the capability","litespm search github --installable",["Choose the GitHub MCP server from the catalog.","Check publisher, source and installability."],"DISCOVER"),
("02  Select targets","One package. Two agents.","--agent claude-code --agent codex",["Claude Code     |     Codex","Choose compatible, connected hosts."],"TARGET"),
("03  Preview","Review before applying","litespm install <package-id> --agent claude-code",["--agent codex --dry-run","Inspect the plan, config paths and required credentials."],"PREVIEW"),
("04  Apply","You decide what changes","Repeat without --dry-run; follow the approval flow.",["Review the source and target selection.","Configuration backups and ledger track managed writes."],"APPROVE"),
("05  Manage","Remove tracked changes","litespm list",["litespm install remove <install-id>","Or restore an eligible backup; review conflicts."],"MANAGE"),
]
frames=[]
for i,(label,heading,cmd,lines,tag) in enumerate(scenes):
    im=Image.new("RGB",(960,480),"#0b1420");d=ImageDraw.Draw(im)
    d.rounded_rectangle((24,24,936,456),radius=20,fill="#101e2a",outline="#2b4451",width=2)
    d.text((54,45),"LiteSPM",font=bold,fill="#62e7b4")
    d.text((905,47),"ILLUSTRATED WORKFLOW",font=small,fill="#a8bec9",anchor="ra")
    d.text((54,98),label,font=small,fill="#66e4b4")
    d.text((54,128),heading,font=title,fill="#f2faf8")
    d.rounded_rectangle((54,196,906,265),radius=12,fill="#07111c",outline="#355464")
    d.text((72,217),"> "+cmd,font=mono,fill="#92f2cc")
    for j,line in enumerate(lines):d.text((57,288+j*34),line,font=normal,fill="#d3e4eb")
    for k,(_,_,_,_,t) in enumerate(scenes):
        x=54+k*173
        d.rounded_rectangle((x,391,x+156,428),radius=8,fill="#1b5d49" if k==i else "#192d3b")
        d.text((x+78,410),t,font=small,fill="#c7ffea" if k==i else "#93aeb9",anchor="mm")
    frames.append(im)
frames[0].save(dest/"litespm-workflow.gif",save_all=True,append_images=frames[1:],duration=[2400,2400,3000,2600,3300],loop=0,optimize=True)
frames[2].save(dest/"litespm-workflow.png",optimize=True)
shutil.copyfile(dest/"litespm-workflow.gif",docs/"litespm-workflow.gif")
print("GIF:",(dest/"litespm-workflow.gif").stat().st_size,"bytes; 5 frames, 13.7 seconds")
