"""Refresh every Office Crave furniture catalog page; publish only a complete crawl."""
import concurrent.futures
import datetime
import html
import json
import pathlib
import re
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parent
BASE = 'https://www.officecrave.com/office-furniture.html'

def download(page):
    url = BASE if page == 1 else BASE + '?page=' + str(page)
    for attempt in range(3):
        try:
            return subprocess.check_output(['curl', '-fLsS', '--max-time', '90', url], text=True)
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))

def parse(raw):
    out = []
    for chunk in re.split(r'<div class="[^"]* product-item">', raw)[1:]:
        def get(pattern):
            match = re.search(pattern, chunk, re.S)
            return html.unescape(match.group(1)).strip() if match else ''
        name = get(r'<span class="product-title">(.*?)</span>')
        value = get(r'<p class="price-2"[^>]*>\$([\d,.]+)')
        if not name:
            continue
        url = get(r'<a href="([^"]+)"')
        image = get(r'<img src="([^"]+)"')
        if not url.startswith('https://www.officecrave.com/') or not image.startswith('https://www.officecrave.com/'):
            raise ValueError('Unexpected source URL; catalog was not replaced')
        out.append(dict(name=name, url=url, image=image,
            sku=get(r'data-product-mpn="([^"]+)"') or get(r'<span class="model">Model: (.*?)</span>'),
            supplierPrice=float(value.replace(',', '')) if value else None))
    if not out:
        raise ValueError('No products found; catalog was not replaced')
    return out

def main():
    first = download(1)
    last = max([1] + [int(n) for n in re.findall(r'[?&]page=(\d+)', first)])
    if last > 1000:
        raise ValueError('Unexpected pagination')
    pages = [parse(first)]
    def get_page(n):
        products = parse(download(n))
        print(f'Page {n}/{last}: {len(products)} products', flush=True)
        return products
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pages.extend(pool.map(get_page, range(2, last + 1)))
    products = {p['url']: p for page in pages for p in page}
    previous = ROOT / 'dist/catalog.json'
    if previous.exists():
        old = json.loads(previous.read_text())
        if len(products) < len(old['products']) * .8:
            raise ValueError('Catalog shrank by over 20%; inspect before replacing')
    data = dict(source=BASE, retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        pages=last, products=list(products.values()))
    payload = json.dumps(data, ensure_ascii=False)
    for name, content in [('catalog.json', payload), ('catalog.js', 'window.CHANCE2_CATALOG = ' + payload.replace('</', '<\\/') + ';\n')]:
        dest = ROOT / 'dist' / name
        temp = dest.with_suffix(dest.suffix + '.tmp')
        temp.write_text(content)
        temp.replace(dest)
    print(f'Imported {len(products)} unique products from {last} pages')

if __name__ == '__main__':
    main()
