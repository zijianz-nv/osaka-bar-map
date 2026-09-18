from pathlib import Path
from PIL import Image
import json, math, io, base64, urllib.request, concurrent.futures, html

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.cache'/'atlas';OUT.mkdir(parents=True,exist_ok=True)
CACHE=OUT/'tiles';CACHE.mkdir(exist_ok=True)
DATA=[]
for name in ['cocktails','whisky','beer','cocktails-extra','whisky-extra','beer-extra']:
    DATA+=json.loads((ROOT/'data'/(name+'.json')).read_text(encoding='utf-8'))
for i,v in enumerate(DATA):v['number']=f'{i+1:02d}'
COLORS={'cocktail':'#936487','whisky':'#b27c31','beer':'#397860'}
SOURCE='https://maps.gsi.go.jp/development/ichiran.html'
W,H=360,350

def project(lat,lng):
    a=math.radians(lat)
    return ((lng+180)/360,(1-math.asinh(math.tan(a))/math.pi)/2)

def tile(z,x,y):
    path=CACHE/f'{z}-{x}-{y}.png'
    if not path.exists():
        url=f'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (personal Kansai travel map)'})
        with urllib.request.urlopen(request,timeout=35) as r:path.write_bytes(r.read())
    image=Image.open(path);image.load()
    assert image.size==(256,256), f'Unexpected map tile {path}'
    return (x,y,image.convert('RGB'))

def background(points,key):
    positions=[project(p['lat'],p['lng']) for p in points]
    xs,ys=zip(*positions)
    xspan=max(xs)-min(xs);yspan=max(ys)-min(ys)
    # Fit true coordinates with room for the numbered callouts.
    scale=min((W-110)/max(xspan,.000006),(H-110)/max(yspan,.000006))
    scale=min(scale,256*2**16)
    cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
    z=max(8,min(17,math.ceil(math.log2(scale/256))))
    world=256*2**z
    bounds=((cx-W/2/scale)*world,(cy-H/2/scale)*world,(cx+W/2/scale)*world,(cy+H/2/scale)*world)
    x0,y0,x1,y1=bounds
    tx0,ty0,tx1,ty1=math.floor(x0/256),math.floor(y0/256),math.floor(x1/256),math.floor(y1/256)
    canvas=Image.new('RGB',((tx1-tx0+1)*256,(ty1-ty0+1)*256))
    jobs=[(z,x,y) for x in range(tx0,tx1+1) for y in range(ty0,ty1+1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for x,y,im in pool.map(lambda j:tile(*j),jobs):canvas.paste(im,((x-tx0)*256,(y-ty0)*256))
    crop=canvas.crop((round(x0-tx0*256),round(y0-ty0*256),round(x1-tx0*256),round(y1-ty0*256)))
    crop=crop.resize((W*2,H*2),Image.Resampling.LANCZOS)
    imagepath=OUT/f'{key}-base.jpg';crop.save(imagepath,'JPEG',quality=78,optimize=True)
    uri='data:image/jpeg;base64,'+base64.b64encode(imagepath.read_bytes()).decode()
    xy=[[(x-cx)*scale+W/2,(y-cy)*scale+H/2] for x,y in positions]
    return uri,xy,z

def separate(points):
    labels=[[p[0],p[1]-12] for p in points]
    # Move only number callouts; a dot and leader line retain each true location.
    for iteration in range(400):
        forces=[[0.,0.] for _ in labels]
        for i in range(len(labels)):
            forces[i][0]+=(points[i][0]-labels[i][0])*.016
            forces[i][1]+=(points[i][1]-12-labels[i][1])*.016
            for j in range(i):
                dx=labels[i][0]-labels[j][0];dy=labels[i][1]-labels[j][1]
                dist=math.hypot(dx,dy)
                if dist<37:
                    if dist<.01:dx,dy,dist=1.,.3,math.hypot(1,.3)
                    f=(37-dist)*.53
                    fx,fy=dx/dist*f,dy/dist*f
                    forces[i][0]+=fx;forces[i][1]+=fy
                    forces[j][0]-=fx;forces[j][1]-=fy
        for i,p in enumerate(labels):
            p[0]=min(W-23,max(23,p[0]+forces[i][0]))
            p[1]=min(H-30,max(32,p[1]+forces[i][1]))
    return labels

def map_svg(venues,key,title):
    uri,xy,z=background(venues,key)
    labels=separate(xy)
    parts=[f'<svg class="atlas-svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="atlas-title-{key}" xmlns="http://www.w3.org/2000/svg"><title id="atlas-title-{key}">{html.escape(title)}，编号对应下方店铺清单</title><image href="{uri}" width="{W}" height="{H}"/><rect width="{W}" height="{H}" fill="#f6f5ef" opacity=".15"/>']
    for v,p,q in zip(venues,xy,labels):
        color=COLORS[v['categories'][0]]
        parts.append(f'<path d="M{p[0]:.1f},{p[1]:.1f} L{q[0]:.1f},{q[1]:.1f}" stroke="{color}" stroke-width="1.3" fill="none"/><circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="3" fill="{color}" stroke="#fffefa" stroke-width="1"/>')
    for v,p,q in zip(venues,xy,labels):
        color=COLORS[v['categories'][0]]
        parts.append(f'<a href="#saved-place-{v["id"]}" data-atlas-place="{v["id"]}" aria-label="{v["number"]} {html.escape(v["name"])}"><circle cx="{q[0]:.1f}" cy="{q[1]:.1f}" r="16" fill="{color}" stroke="#fffefa" stroke-width="2"/><text x="{q[0]:.1f}" y="{q[1]+4:.1f}" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="white">{v["number"]}</text></a>')
    parts.append(f'<rect x="{W-31}" y="8" width="23" height="23" rx="3" fill="#fffefa" opacity=".95"/><text x="{W-19.5}" y="24" text-anchor="middle" font-size="12" fill="#182f2c">N ↑</text></svg>')
    svg=''.join(parts);(OUT/f'{key}.svg').write_text(svg,encoding='utf-8')
    return svg

def overview():
    uri,xy,z=background(DATA,'kansai')
    parts=[f'<svg class="atlas-svg atlas-region" viewBox="0 0 {W} {H}" role="img" aria-label="大阪、京都、神户三城及36家店铺位置总览" xmlns="http://www.w3.org/2000/svg"><image href="{uri}" width="{W}" height="{H}"/><rect width="{W}" height="{H}" fill="#f6f5ef" opacity=".12"/>']
    for v,p in zip(DATA,xy):parts.append(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="3.5" fill="{COLORS[v["categories"][0]]}" stroke="#fffefa" stroke-width=".8"/>')
    for city,target,dx,dy in [('大阪','osaka-north',22,35),('京都','kyoto',-40,-32),('神户','kobe',-3,35)]:
        indexes=[i for i,v in enumerate(DATA) if v['city']==city]
        x=sum(xy[i][0] for i in indexes)/len(indexes)+dx;y=sum(xy[i][1] for i in indexes)/len(indexes)+dy
        x=max(48,min(W-48,x));y=max(18,min(H-22,y))
        parts.append(f'<a href="#atlas-{target}"><rect x="{x-45:.1f}" y="{y-13:.1f}" width="90" height="29" rx="5" fill="#182f2c"/><text x="{x:.1f}" y="{y+6:.1f}" text-anchor="middle" fill="#fffefa" font-size="13">{city} · {len(indexes)} 家</text></a>')
    parts.append('</svg>');svg=''.join(parts);(OUT/'kansai.svg').write_text(svg,encoding='utf-8');return svg

parts=['<section id="offline-atlas" class="offline-atlas"><div class="atlas-heading"><p class="eyebrow">OFFLINE ATLAS / 36 PLACES</p><h2>把今晚，放进地图里。</h2><p>总览与分区地图均已内嵌。编号对应店铺清单；点编号可跳到该店。小圆点是实际位置，连线连接为了清晰而错开的编号。</p></div><div class="atlas-legend"><span><i class="dot cocktail"></i>鸡尾酒</span><span><i class="dot whisky"></i>威士忌</span><span><i class="dot beer"></i>精酿</span></div><div class="atlas-panels"><section class="atlas-panel"><h3>关西总览</h3><p>大阪及府内周边 24 家 · 京都 6 家 · 神户 6 家</p>',overview(),'</section>']
groups=[
 ('osaka-north','大阪北部 · 梅田与北新地',[v for v in DATA if v['city']=='大阪' and 34.688<=v['lat']<34.72]),
 ('osaka-south','大阪南部 · 心斋桥、本町与大正',[v for v in DATA if v['city']=='大阪' and v['lat']<34.688]),
 ('osaka-outskirts','大阪周边 · 箕面与东三国',[v for v in DATA if v['city']=='大阪' and v['lat']>=34.72]),
 ('kyoto','京都 · 河原町、祇园与高濑川',[v for v in DATA if v['city']=='京都']),
 ('kobe','神户 · 三宫、北野坂与元町',[v for v in DATA if v['city']=='神户'])]
assert sum(len(g[2]) for g in groups)==36
for key,title,venues in groups:
    parts.append(f'<section class="atlas-panel" id="atlas-{key}"><h3>{title}</h3><p>{len(venues)} 家 · 编号与店铺详情一致</p>')
    parts.append(map_svg(venues,key,title))
    parts.append('<div class="atlas-index">')
    for v in venues:parts.append(f'<a href="#saved-place-{v["id"]}" data-atlas-place="{v["id"]}"><b style="background:{COLORS[v["categories"][0]]}">{v["number"]}</b><span>{html.escape(v["name"])}</span></a>')
    parts.append('</div></section>')
parts.append(f'</div><p class="atlas-source">底图：<a href="{SOURCE}" target="_blank" rel="noopener noreferrer">国土地理院「地理院タイル」</a>，已叠加店铺位置与编号。用于位置参考，具体入口及楼层以文字地址和照片说明为准。</p></section>')
(ROOT/'assets'/'atlas.html').write_text(''.join(parts),encoding='utf-8')
print('Created atlas: 1 Kansai overview + 5 region maps, 36 numbered locations.')
