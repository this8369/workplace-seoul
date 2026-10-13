"""Extract the Seoul major-park workbook without modifying it.
Usage: python extract-overview-parks.py input.xlsx output.json
Only confirmed square-metre values and usable WGS84 points are accepted.
"""
import json
import re
import sys
from pathlib import Path
import openpyxl

workbook = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
parks, skipped = [], []
for row_number, row in enumerate(list(workbook.active.values)[3:], 4):
    if not row[3]:
        continue
    match = re.match(r'^\s*([\d,.]+)\s*(?:(?:㎡|m²|m2|제곱미터)(?:\s|$|\()|$)', str(row[5]))
    try:
        area = float(match[1].replace(',', '')) if match else None
        lon, lat = float(row[17]), float(row[18])
    except (ValueError, TypeError):
        skipped.append(row_number)
        continue
    if 33 < lon < 39 and 124 < lat < 132:
        lon, lat = lat, lon
    if not area or not (124 < lon < 132 and 33 < lat < 39):
        skipped.append(row_number)
        continue
    if area < 10000:
        continue
    parks.append(dict(source_row=row_number, name=str(row[3]).strip(), area_m2=area,
        longitude=lon, latitude=lat, address=row[14],
        source_url='https://data.seoul.go.kr/dataList/OA-394/S/1/datasetView.do',
        source_name='서울특별시 주요 공원현황 (2026 하반기)', as_of='2026-09-23'))
Path(sys.argv[2]).write_text(json.dumps(parks, ensure_ascii=False, indent=2))
print(json.dumps(dict(accepted=len(parks), skipped_rows=skipped)))
