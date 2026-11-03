import zipfile,xml.etree.ElementTree as ET,json,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
p=Path(r'C:/Users/apure/OneDrive/Stefan Made Simple 計算表 for Eric.xlsx')
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(p) as z:
 strings=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
 rels={e.attrib['Id']:e.attrib['Target'] for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
 out=[]
 for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',ns):
  target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
  path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
  cells={}
  for c in ET.fromstring(z.read(path)).findall('.//s:sheetData/s:row/s:c',ns):
   v=c.find('s:v',ns); f=c.find('s:f',ns)
   if v is None: continue
   value=v.text
   if c.get('t')=='s':value=strings[int(value)]
   cells[c.get('r')]={'v':value,'t':c.get('t'),'f':f.text if f is not None else None}
  out.append({'name':sheet.get('name'),'cells':cells})
Path('imports/workbook-cells.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print('Sheets:',len(out))
for s in out:
 c=s['cells']; print(s['name'],json.dumps({k:c[k]['v'] for k in ['M7','M8','D8','G8','J8','D9','G9','J9','M9','Q9'] if k in c},ensure_ascii=False))
