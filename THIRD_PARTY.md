# 第三方组件与资料来源

本项目保留了店铺、评分、坐标和照片的来源链接。以下软件、地图与照片各自遵循其原始来源的许可或权利归属。

## 前端组件

| 组件 | 版本 | 用途 | 许可 |
| --- | --- | --- | --- |
| [Leaflet](https://github.com/Leaflet/Leaflet/tree/v1.9.4) | 1.9.4 | 交互地图 | BSD 2-Clause；见 [vendor/LICENSE-leaflet.txt](vendor/LICENSE-leaflet.txt) |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster/tree/v1.5.3) | 1.5.3 | 相邻店铺点位聚合 | MIT；见 [vendor/LICENSE-markercluster.txt](vendor/LICENSE-markercluster.txt) |

上述组件的 JavaScript 和 CSS 随仓库保存，构建时内嵌到 `index.html`。Python 图像处理依赖 [Pillow](https://python-pillow.github.io/) 按 `requirements.txt` 安装，仅用于构建。

## 地图底图

交互地图与静态图册使用日本国土地理院的**地理院タイル・淡色地図（pale）**。来源及数据说明：[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)。

静态地图由原始瓦片拼接、缩放后叠加店铺位置、编号与引线生成；页面内保留了国土地理院署名。编号偏移用于避免文字重叠，连接线所指的小圆点保留店铺实际坐标。

## 店铺资料与评分

店铺资料来自店铺官网、食べログ、公开地图及相关介绍页面。六份店铺 JSON 位于 `data/`，每家店的 `sources`、`coordinateSource` 和 `ratings[].url` 可追溯电话、地址、坐标与评分来源。

评分采用食べログ 5 分制，记录日期为 2026-09-18；没有将其他平台的评分混入该数值。来源链接和日期随数据保留在生成的 HTML 中。

## 门头与入口照片

`assets/storefronts/` 中的照片来自店铺官网、公开店铺页面或访店照片，权利归原摄影者及其他相应权利人所有。本项目未为这些照片另行授予统一开源许可，也不因将照片内嵌进 HTML 而改变其权利归属。

每张照片的来源记录保存在以下清单：

- [data/photos-cocktail.json](data/photos-cocktail.json)
- [data/photos-whisky.json](data/photos-whisky.json)
- [data/photos-beer.json](data/photos-beer.json)

清单包含店铺 `id`、本地相对路径 `path`、原始页面 `sourcePage`、原图地址 `imageUrl`、图注 `caption` 与照片类型 `kind`。照片展示下方也提供“照片来源”链接。部分为招牌局部、楼宇入口或历史照片，具体范围与年代以图注和原页为准。

构建只对照片进行方向校正、尺寸缩小和 JPEG 压缩，未生成或替换照片中的店铺内容。
