from pathlib import Path
import json
from html import escape
from urllib.parse import quote
from PIL import Image, ImageOps
import base64, io
root=Path(__file__).resolve().parents[1]
data=[]
for file in ['cocktails.json','whisky.json','beer.json','cocktails-extra.json','whisky-extra.json','beer-extra.json']:
    data.extend(json.loads((root/'data'/file).read_text(encoding='utf-8')))
assert len(data)==36
assert len({v['id'] for v in data})==len(data)
assert len({v['address'] for v in data})==len(data)
for v in data:
    assert v['phone'] and v['address'] and v['coordinateSource']
    assert 34.5 < v['lat'] < 35.2 and 134.9 < v['lng'] < 135.9
    assert v['ratings'][0]['platform']=='食べログ'
    assert 0 <= v['ratings'][0]['score'] <= 5
    v['verifiedAt']='2026-09-18'
photos={}
for name in ['cocktail','whisky','beer']:
    for photo in json.loads((root/'data'/f'photos-{name}.json').read_text(encoding='utf-8')):
        assert photo['verified'] and (root/photo['path']).is_file()
        assert photo['id'] not in photos
        photos[photo['id']]=photo
assert set(photos)=={v['id'] for v in data}
def photo_html(v):
    photo=photos[v['id']]
    image=ImageOps.exif_transpose(Image.open(root/photo['path'])).convert('RGB')
    image.thumbnail((720,640),Image.Resampling.LANCZOS)
    buf=io.BytesIO();image.save(buf,'JPEG',quality=79,optimize=True)
    uri='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
    return f'''<figure class="storefront"><img src="{uri}" width="{image.width}" height="{image.height}" alt="{escape(v['name'])}：{escape(photo['caption'])}" loading="lazy" decoding="async"><figcaption><span>{escape(photo['caption'])}</span><a href="{escape(photo['sourcePage'])}" target="_blank" rel="noopener noreferrer">照片来源 ↗</a></figcaption></figure>'''
categories={'cocktail':'鸡尾酒','whisky':'威士忌','beer':'精酿'}
static=['<div class="static-intro"><h2>离线图册 · '+str(len(data))+' 个去处</h2><p>地图、店铺资料与36张门头／入口参考照片均在这一个文件里。点击地图编号查看店铺，也可直接跳到城市清单。</p><p class="static-date">资料查询：2026.09.18 · 食べログ5分制评分，非实时更新。</p><nav aria-label="清单城市导航"><a href="#offline-atlas">地图汇总 ↓</a>']
for idx,city in enumerate(['大阪','京都','神户']):
    static.append(f'<a href="#saved-city-{idx}">{city} · {sum(v["city"]==city for v in data)} 家</a>')
static.append('</nav></div>')
static.append((root/'assets'/'atlas.html').read_text(encoding='utf-8'))
for idx,city in enumerate(['大阪','京都','神户']):
    static.append(f'<section class="static-city" id="saved-city-{idx}"><h2>{city}</h2><div class="static-grid">')
    for v in [v for v in data if v['city']==city]:
        number=f'{data.index(v)+1:02d}'
        r=v['ratings'][0]
        tel='+81'+''.join(c for c in v['phone'] if c.isdigit()).removeprefix('0')
        query=quote(v['name']+' '+v['address'])
        category=' / '.join(categories[c] for c in v['categories'])
        source_links=' · '.join(f'<a href="{escape(s["url"])}" target="_blank" rel="noopener noreferrer">{escape(s["label"])}</a>' for s in v['sources'])
        static.append(f'''<article class="static-venue" id="saved-place-{v['id']}"><span class="static-meta">{escape(category)} · {escape(v['area'])}</span><h3><b class="static-number">{number}</b>{escape(v['name'])}</h3><p class="static-japanese">{escape(v['nameJa'])}</p>{photo_html(v)}<p><a class="static-score" href="{escape(r['url'])}" target="_blank" rel="noopener noreferrer">★ {r['score']:.2f} / 5</a> · 食べログ · {r['count']} 人评价</p><p>{escape(v['description'])}</p><dl><dt>地址</dt><dd>{escape(v['address'])}</dd><dt>电话</dt><dd><a href="tel:{tel}">{escape(v['phone'])}</a></dd></dl><p>{escape(v.get('tip',''))}</p><div class="static-actions"><a href="https://www.google.com/maps/search/?api=1&amp;query={query}" target="_blank" rel="noopener noreferrer">Google 地图 ↗</a><a href="https://maps.apple.com/?q={query}" target="_blank" rel="noopener noreferrer">Apple 地图 ↗</a></div><p class="static-sources">来源：{source_links}</p><a class="back-atlas" href="#offline-atlas">↑ 返回地图汇总</a></article>''')
    static.append('</div></section>')
html=(root/'src'/'template.html').read_text(encoding='utf-8')
html=html.replace('STATIC_GUIDE_PLACEHOLDER',''.join(static)).replace('VENUE_COUNT_TEXT',f'{len(data)} 个去处 / 3 座城市').replace('TOTAL_COUNT',str(len(data))).replace('OSAKA_COUNT',str(sum(v['city']=='大阪' for v in data)))
for marker,file in [('/* LEAFLET_CSS */','leaflet.css'),('/* CLUSTER_CSS */','markercluster.css'),('/* APP_CSS */','app.css'),('/* LEAFLET_JS */','leaflet.js'),('/* CLUSTER_JS */','markercluster.js'),('/* APP_JS */','app.js')]:
    html=html.replace(marker,(root/('src' if file.startswith('app.') else 'vendor')/file).read_text(encoding='utf-8').replace('//# sourceMappingURL=leaflet.js.map',''))
html=html.replace('DATA_PLACEHOLDER',json.dumps(data,ensure_ascii=False).replace('</','<\\/'))
out=root/'index.html'
out.write_text(html,encoding='utf-8')
print(f'Built {out} · {len(data)} venues · {out.stat().st_size:,} bytes')
