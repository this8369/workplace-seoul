"""Convert collected photos without enlarging them or removing source marks."""
import base64, json, io, os
from PIL import Image, ImageOps, ImageDraw, ImageFont
root='data/private/images'
records=json.load(open(f'{root}/collection.json'))
items=[]; originals=0; optimized=0
for record in records.values():
    if not record.get('image_file'): continue
    with Image.open(record['image_file']) as source:
        image=ImageOps.exif_transpose(source).convert('RGB')
        if min(image.size)<80: continue
        row={k:record[k] for k in ['building_id','title','source_name','source_url','source_image_url','source_date','review_note']}
        row['kind']=record.get('kind','photo')
        row.update(focal_x=record.get('focal_x',50),focal_y=record.get('focal_y',50))
        for key,maxsize,quality in [('detail',1600,82),('thumbnail',480,78)]:
            output=image.copy(); output.thumbnail((maxsize,maxsize),Image.Resampling.LANCZOS)
            buf=io.BytesIO();output.save(buf,'WEBP',quality=quality,method=6)
            binary=buf.getvalue(); optimized+=len(binary)
            open(f'{root}/{record["building_id"]}-{key}.webp','wb').write(binary)
            row[f'{key}_base64']=base64.b64encode(binary).decode()
        originals+=os.path.getsize(record['image_file']);items.append(row)
font=ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',13)
for group in range(0,len(items),40):
    subset=items[group:group+40];sheet=Image.new('RGB',(1000,((len(subset)+4)//5)*165),'#ffffff');draw=ImageDraw.Draw(sheet)
    for idx,row in enumerate(subset):
        with Image.open(f'{root}/{row["building_id"]}-detail.webp') as source:
            thumb=ImageOps.contain(source,(190,135));x=(idx%5)*200;y=(idx//5)*165
            sheet.paste(thumb,(x+(190-thumb.width)//2,y));draw.text((x+3,y+137),f'{group+idx+1}. {row["title"][:18]}',font=font,fill='#1c2435')
    sheet.save(f'/tmp/workplace-photo-contact-{group//40+1}.jpg',quality=90)
json.dump({'version':1,'items':items},open(f'{root}/workplace-photos.json','w'),ensure_ascii=False)
print(json.dumps({'photos':len(items),'source_bytes':originals,'webp_total_bytes':optimized,'manifest_bytes':os.path.getsize(f'{root}/workplace-photos.json')}))
