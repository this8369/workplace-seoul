"""Prepare WebP and review sheets; publish only explicitly reviewed image IDs."""
import base64, json, io, os
from PIL import Image, ImageOps, ImageDraw, ImageFont
root='data/private/images'; out=root+'/research'
records=json.load(open(out+'/downloads.json'))
selected={x['building_id']:x for x in json.load(open(root+'/research-plan.json'))}
approved=set(json.load(open(out+'/approved.json'))) if os.path.exists(out+'/approved.json') else set()
items=[]; review=[]
for record in records:
    chosen=selected.get(record['building_id'])
    if not chosen or chosen['source_image_url']!=record['source_image_url']:continue
    try:
        with Image.open(record['file']) as source:image=ImageOps.exif_transpose(source).convert('RGB')
        if min(image.size)<80:continue
        row={k:chosen[k] for k in ['building_id','source_name','source_url','source_image_url','review_note','kind']}
        row.update(title=chosen['name'].split('\n')[0]+(' 조감도' if chosen['kind']=='rendering' else ' 외관'),source_date=record['collected_at'][:10],focal_x=chosen.get('focal_x',50),focal_y=chosen.get('focal_y',50))
        for key,maxsize,quality in [('detail',1600,82),('thumbnail',480,78)]:
            output=image.copy();output.thumbnail((maxsize,maxsize),Image.Resampling.LANCZOS)
            buf=io.BytesIO();output.save(buf,'WEBP',quality=quality,method=6)
            binary=buf.getvalue();open(f'{out}/{record["building_id"]}-{key}.webp','wb').write(binary)
            row[f'{key}_base64']=base64.b64encode(binary).decode()
        review.append({**chosen,'review_index':len(review)+1,'width':image.width,'height':image.height})
        if row['building_id'] in approved:items.append(row)
    except Exception as e:print('Skipped',record['name'],str(e))
font=ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',14)
for group in range(0,len(review),30):
    subset=review[group:group+30];sheet=Image.new('RGB',(1250,((len(subset)+4)//5)*205),'#ffffff');draw=ImageDraw.Draw(sheet)
    for idx,row in enumerate(subset):
        with Image.open(f'{out}/{row["building_id"]}-detail.webp') as source:
            thumb=ImageOps.contain(source,(240,170));x=(idx%5)*250;y=(idx//5)*205
            sheet.paste(thumb,(x+(240-thumb.width)//2,y));draw.text((x+3,y+172),f'{row["review_index"]}. {row["name"].split(chr(10))[0][:20]}',font=font,fill='#1c2435')
    sheet.save(f'{out}/contact-{group//30+1}.jpg',quality=90)
json.dump(review,open(out+'/review-index.json','w'),ensure_ascii=False,indent=2)
if approved:
    # The local import endpoint must never serve a partially written manifest.
    manifest=root+'/workplace-photos.json'
    with open(manifest+'.tmp','w') as output:
        json.dump({'version':1,'items':items},output,ensure_ascii=False)
    os.replace(manifest+'.tmp',manifest)
print(json.dumps({'candidates':len(review),'approved':len(items)}))
