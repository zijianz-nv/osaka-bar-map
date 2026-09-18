'use strict';
const venues=JSON.parse(document.getElementById('venue-data').textContent);
const categoryNames={cocktail:'鸡尾酒',whisky:'威士忌',beer:'精酿'};
const categoryColors={cocktail:'#936487',whisky:'#b27c31',beer:'#397860'};
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const external='target="_blank" rel="noopener noreferrer"';
const storageKey='kansai-after-dark-favorites-v1';
let saved=new Set();
try{const stored=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(stored))saved=new Set(stored.filter(id=>venues.some(v=>v.id===id)));}catch{}
const state={city:'大阪',category:'all',query:'',sort:'curated',savedOnly:false,selected:null};
let map,markerLayer,tiles,visibleVenues=[],markers=new Map(),toastTimer,tileLoaded=false;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
venues.forEach((v,i)=>{v.number=String(i+1).padStart(2,'0');v.primary=v.categories[0];});
$('#edition-count').textContent=`${venues.length} 个去处 / 3 座城市`;

function ratingOf(v){return v.ratings.find(r=>r.platform==='食べログ')||v.ratings[0]||{};}
function mapURL(v){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(v.name+' '+v.address);}
function appleURL(v){return 'https://maps.apple.com/?q='+encodeURIComponent(v.name+' '+v.address);}
function navURL(v){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(v.name+' '+v.address);}
function internationalPhone(phone){return '+81'+phone.replace(/\D/g,'').replace(/^0/,'');}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2600);}
function filtered(){
  let list=venues.filter(v=>(state.city==='all'||v.city===state.city)&&(state.category==='all'||v.categories.includes(state.category))&&(!state.savedOnly||saved.has(v.id)));
  if(state.query){const query=state.query.normalize('NFKC').toLocaleLowerCase().trim();list=list.filter(v=>[v.name,v.nameJa,v.city,v.area,v.address,v.description,...v.categories.map(c=>categoryNames[c])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query));}
  return list.sort((a,b)=>{
    if(state.sort==='rating')return (ratingOf(b).score??-1)-(ratingOf(a).score??-1)||(ratingOf(b).count??0)-(ratingOf(a).count??0);
    if(state.sort==='reviews')return (ratingOf(b).count??0)-(ratingOf(a).count??0);
    const cities=['大阪','京都','神户'];return cities.indexOf(a.city)-cities.indexOf(b.city)||b.lat-a.lat||a.lng-b.lng;
  });
}
function ratingHTML(v){const r=ratingOf(v);return `<div class="rating"><a href="${escapeHTML(r.url)}" ${external} aria-label="食べログ评分 ${r.score??'暂无'} 分，${r.count??'未知'} 人评价"><span class="rating-star">★</span><span class="rating-score">${typeof r.score==='number'?r.score.toFixed(2):'暂无'}</span></a><span class="rating-label">/ 5 · 食べログ</span>${r.count!=null?`<span class="review-count">${r.count} 人评价</span>`:''}</div>`;}
function detailsHTML(v){
  const sources=[...v.sources];if(v.coordinateSource&&!sources.some(s=>s.url===v.coordinateSource))sources.push({label:'地图坐标来源',url:v.coordinateSource});
  return `<div class="venue-details"><div class="detail-line"><span class="detail-label">ADDRESS / 日文地址</span><div class="detail-value">${escapeHTML(v.address)}<button type="button" class="copy-address" data-copy="${v.id}">复制</button></div></div><div class="detail-line"><span class="detail-label">PHONE / 电话</span><div class="detail-value"><a href="tel:${internationalPhone(v.phone)}">${escapeHTML(v.phone)}</a></div></div>${v.tip?`<p class="detail-tip">${escapeHTML(v.tip)}</p>`:''}<div class="detail-links"><a class="primary-link" href="${navURL(v)}" ${external}>去这里 ↗</a><a href="${mapURL(v)}" ${external}>Google 地图</a><a href="${appleURL(v)}" ${external}>Apple 地图</a></div><p class="coordinate-note">${escapeHTML(v.coordinatePrecision||'地图平台店铺位置；入口与楼层以地址为准。')}</p><details class="sources"><summary>资料来源 · 2026.09.18</summary><ul>${sources.map(s=>`<li><a href="${escapeHTML(s.url)}" ${external}>${escapeHTML(s.label)} ↗</a></li>`).join('')}</ul></details></div>`;
}
function photoHTML(v){const figure=document.getElementById('saved-place-'+v.id)?.querySelector('.storefront');return figure?figure.outerHTML:'';}
function cardHTML(v){const selected=state.selected===v.id;return `<article class="venue${selected?' selected':''}" data-id="${v.id}"><div class="venue-head"><span class="venue-number">${v.number}</span><button type="button" class="venue-title-button" data-select="${v.id}" aria-expanded="${selected}" aria-controls="details-${v.id}"><h2>${escapeHTML(v.name)}</h2><span class="subname">${escapeHTML(v.nameJa)}</span></button><button type="button" class="favorite-button" data-save="${v.id}" aria-label="${saved.has(v.id)?'取消收藏':'收藏'} ${escapeHTML(v.name)}" aria-pressed="${saved.has(v.id)}">${saved.has(v.id)?'♥':'♡'}</button></div><div class="venue-meta"><span class="category-label"><i class="dot ${v.primary}"></i>${v.categories.map(c=>categoryNames[c]).join(' / ')}</span><span class="meta-separator">/</span><span>${escapeHTML(v.area)}</span></div>${ratingHTML(v)}${photoHTML(v)}<div class="mobile-contact"><a href="tel:${internationalPhone(v.phone)}">${escapeHTML(v.phone)}</a><p>${escapeHTML(v.address)}</p></div><p class="venue-description">${escapeHTML(v.description)}</p><div class="venue-actions"><button type="button" data-select="${v.id}" aria-expanded="${selected}" aria-controls="details-${v.id}">${selected?'收起详情 ↑':'电话 · 地址 · 详情 ↗'}</button><a href="${navURL(v)}" ${external}>导航 ↗</a></div><div id="details-${v.id}"${selected?'':' hidden'}>${selected?detailsHTML(v):''}</div></article>`;}
function renderList(){
  $('#results').innerHTML=visibleVenues.length?visibleVenues.map(cardHTML).join(''):`<div class="empty"><div class="empty-symbol">⌕</div><h2>这一杯，还没找到</h2><p>${state.savedOnly?'当前条件下没有收藏。点击店铺旁的爱心，把喜欢的地方留下。':'试试切换城市、酒类，或换一个搜索词。'}</p><button type="button" id="reset-filters">重置筛选</button></div>`;
  $('#result-count').innerHTML=`<strong>${visibleVenues.length}</strong> 家${state.savedOnly?'已收藏店铺':'值得坐下的地方'}`;
  $('#saved-count').textContent=saved.size;
  $('#mobile-result-count').textContent=visibleVenues.length;
  $('#random').disabled=!visibleVenues.length;
  $('#saved-only').setAttribute('aria-pressed',state.savedOnly);
}
function popupHTML(v){const r=ratingOf(v);return `<div class="popup-category"><i class="dot ${v.primary}"></i>${v.city} · ${v.categories.map(c=>categoryNames[c]).join(' / ')}</div><h3>${escapeHTML(v.name)}</h3><div class="popup-rating"><span class="rating-star">★</span> <strong>${Number(r.score).toFixed(2)}</strong> <span class="rating-label">/ 5 · 食べログ · ${r.count} 人评价</span></div><p>${escapeHTML(v.address)}</p><p><a href="tel:${internationalPhone(v.phone)}">${escapeHTML(v.phone)}</a></p><div class="popup-links"><a href="${navURL(v)}" ${external}>Google 导航 ↗</a><a href="${appleURL(v)}" ${external}>Apple 地图 ↗</a><a href="${escapeHTML(r.url)}" ${external}>查看评分 ↗</a></div>`;}
function iconFor(v){const active=state.selected===v.id;return L.divIcon({className:'bar-marker',html:`<div class="pin${active?' selected':''}"><svg viewBox="0 0 32 38" aria-hidden="true"><path d="M16 37C12 30 1 23 1 16A15 15 0 0 1 31 16C31 23 20 30 16 37Z" fill="${categoryColors[v.primary]}" stroke="#fffef9" stroke-width="2"/></svg><span class="pin-number">${v.number}</span></div>`,iconSize:[32,38],iconAnchor:[16,38],popupAnchor:[0,-33]});}
function renderMarkers(){
  if(!map)return;markerLayer.clearLayers();markers.clear();
  visibleVenues.forEach(v=>{const marker=L.marker([v.lat,v.lng],{icon:iconFor(v),title:`${v.name} · ${categoryNames[v.primary]}`,alt:`${v.name}，点击查看电话地址`,riseOnHover:true,zIndexOffset:state.selected===v.id?1000:0}).bindPopup(popupHTML(v),{maxWidth:280,minWidth:205,autoPanPaddingTopLeft:[15,72],autoPanPaddingBottomRight:[15,60]});marker.on('click',()=>selectVenue(v.id,{fromMap:true,toggle:false}));markerLayer.addLayer(marker);markers.set(v.id,marker);});
  $('#map-caption').textContent=`${state.city==='all'?'关西三城':state.city} · ${visibleVenues.length} 家`;
}
function fitResults(){if(!map||!visibleVenues.length)return;map.fitBounds(L.latLngBounds(visibleVenues.map(v=>[v.lat,v.lng])),{paddingTopLeft:[45,85],paddingBottomRight:[55,65],maxZoom:15,animate:false});}
function render({fit=true}={}){
  visibleVenues=filtered();if(!visibleVenues.some(v=>v.id===state.selected))state.selected=null;
  renderList();renderMarkers();
  document.querySelectorAll('[data-city]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.city===state.city));
  document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.category===state.category));
  const hints={'大阪':'从大阪开始，慢慢喝。','京都':'换一座城，找一间小酒馆。','神户':'沿着三宫，收集一晚的微醺。','all':'一张地图，收藏关西的吧台。'};$('#city-hint').textContent=hints[state.city];
  if(fit)fitResults();
}
function selectVenue(id,{fromMap=false,toggle=true}={}){
  const v=venues.find(v=>v.id===id);if(!v)return;
  if(toggle&&state.selected===id){state.selected=null;renderList();if(map){map.closePopup();markers.forEach((m,mid)=>m.setIcon(iconFor(venues.find(v=>v.id===mid))));}return;}
  state.selected=id;renderList();
  markers.forEach((m,mid)=>{const item=venues.find(v=>v.id===mid);m.setIcon(iconFor(item));m.setZIndexOffset(mid===id?1000:0);});
  const marker=markers.get(id);
  if(map&&marker&&!fromMap){map.setView([v.lat,v.lng],Math.max(map.getZoom(),15),{animate:false});markerLayer.zoomToShowLayer(marker,()=>marker.openPopup());}
  const card=document.querySelector(`.venue[data-id="${id}"]`);
  if(card){if(matchMedia('(min-width:721px)').matches){const list=$('#results');const top=list.scrollTop+card.getBoundingClientRect().top-list.getBoundingClientRect().top;list.scrollTo({top,behavior:reduceMotion?'instant':'smooth'});}else if(fromMap){card.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});}}
}
function initMap(){
  if(typeof L==='undefined'){showMapProblem();return;}
  map=L.map('map',{zoomControl:false,attributionControl:false,preferCanvas:true,minZoom:7,maxZoom:19}).setView([34.69,135.50],13);
  L.control.zoom({position:'bottomright',zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(map);
  L.control.attribution({position:'bottomleft',prefix:'<a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>'}).addTo(map);
  tiles=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{attribution:'出典：<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院 地理院タイル</a>',maxNativeZoom:18,maxZoom:19,crossOrigin:true});
  tiles.on('tileload',()=>{tileLoaded=true;$('#map-status').hidden=true;});
  let failures=0;tiles.on('tileerror',()=>{failures++;if(failures>4&&!tileLoaded)showMapProblem();});
  tiles.addTo(map);markerLayer=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:45,spiderfyDistanceMultiplier:1.5,animate:false,animateAddingMarkers:false,iconCreateFunction:cluster=>L.divIcon({html:`<span>${cluster.getChildCount()}<small>家</small></span>`,className:'bar-cluster',iconSize:[42,42]})}).addTo(map);
  setTimeout(()=>{if(!tileLoaded)showMapProblem();},12000);
  new ResizeObserver(()=>map.invalidateSize()).observe($('#map'));
}
function showMapProblem(){$('#map-status').hidden=false;}
function resetFilters(){state.city='all';state.category='all';state.query='';state.savedOnly=false;state.selected=null;state.sort='curated';$('#search').value='';$('#sort').value='curated';render();}
document.addEventListener('click',async e=>{
  const jump=e.target.closest('[data-jump]');if(jump){const targets={map:'#map-section',list:'#list-heading',filters:'.city-nav'};$(targets[jump.dataset.jump]).scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});return;}
  const city=e.target.closest('[data-city]');if(city){state.city=city.dataset.city;state.selected=null;render();return;}
  const category=e.target.closest('[data-category]');if(category){state.category=category.dataset.category;state.selected=null;render();return;}
  const favorite=e.target.closest('[data-save]');if(favorite){const id=favorite.dataset.save;saved.has(id)?saved.delete(id):saved.add(id);try{localStorage.setItem(storageKey,JSON.stringify([...saved]));}catch{toast('当前浏览器不允许保存，收藏仅在本次打开时有效。');}render({fit:false});return;}
  const select=e.target.closest('[data-select]');if(select){selectVenue(select.dataset.select);return;}
  const copy=e.target.closest('[data-copy]');if(copy){const address=venues.find(v=>v.id===copy.dataset.copy).address;try{await navigator.clipboard.writeText(address);toast('日文地址已复制');}catch{const box=document.createElement('textarea');box.value=address;box.style.position='fixed';box.style.opacity='0';document.body.appendChild(box);box.select();const ok=document.execCommand('copy');box.remove();toast(ok?'日文地址已复制':'请长按或选中地址文字复制');}return;}
  if(e.target.closest('#reset-filters'))resetFilters();
});
$('#search').addEventListener('input',e=>{state.query=e.target.value;state.selected=null;render();});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;render({fit:false});});
$('#saved-only').addEventListener('click',()=>{state.savedOnly=!state.savedOnly;state.selected=null;render();});
$('#fit-map').addEventListener('click',fitResults);
$('#random').addEventListener('click',()=>{if(visibleVenues.length)selectVenue(visibleVenues[Math.floor(Math.random()*visibleVenues.length)].id,{toggle:false});});
$('#retry-map').addEventListener('click',()=>{if(!tiles)return;tileLoaded=false;$('#map-status').hidden=true;tiles.redraw();setTimeout(()=>{if(!tileLoaded)showMapProblem();},8000);});
const atlasDialog=$('#atlas-dialog');const atlasHome=$('#offline-atlas');const atlasPlaceholder=document.createComment('offline-atlas home');
$('#atlas-open').addEventListener('click',()=>{atlasHome.before(atlasPlaceholder);$('#atlas-body').append(atlasHome);atlasDialog.showModal();});
$('#atlas-close').addEventListener('click',()=>atlasDialog.close());
atlasDialog.addEventListener('close',()=>{if(atlasPlaceholder.parentNode)atlasPlaceholder.replaceWith(atlasHome);});
atlasDialog.addEventListener('click',e=>{const place=e.target.closest('[data-atlas-place]');if(place){e.preventDefault();const id=place.dataset.atlasPlace;atlasDialog.close();state.city='all';state.category='all';state.query='';state.savedOnly=false;$('#search').value='';render({fit:false});selectVenue(id,{toggle:false});if(matchMedia('(max-width:720px)').matches)document.querySelector('.venue.selected').scrollIntoView({block:'start',behavior:'instant'});return;}const group=e.target.closest('a[href^="#atlas-"]');if(group){e.preventDefault();atlasDialog.querySelector(group.getAttribute('href'))?.scrollIntoView({block:'start',behavior:'instant'});}});
const dialog=$('#about-dialog');$('#about-open').addEventListener('click',()=>dialog.showModal());$('#about-footer').addEventListener('click',()=>dialog.showModal());$('#about-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!dialog.open){e.preventDefault();$('#search').focus();}});
try{document.documentElement.classList.add('app-ready');initMap();render();}catch(error){document.documentElement.classList.remove('app-ready');console.error('Interactive view unavailable; showing the complete saved guide.',error);}
