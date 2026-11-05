import importlib.util,io,json,shutil,tempfile,unittest,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from write_workbook import write_workbook,S,R
ROOT=Path(__file__).resolve().parents[1]
class WriterTests(unittest.TestCase):
 def test_preservation_idempotency_and_cached_formulas(self):
  model=json.loads((ROOT/'.local-sync/test-sheet.json').read_text(encoding='utf-8'))
  with tempfile.TemporaryDirectory(dir=ROOT/'.local-sync') as folder:
   path=Path(folder)/'copy.xlsx';shutil.copy2(ROOT/'imports/history-source.xlsx',path)
   with zipfile.ZipFile(path) as z:before={n:z.read(n) for n in z.namelist()}
   self.assertEqual(write_workbook(path,[model],Path(folder)/'backups'),[model['name']])
   first=path.read_bytes();self.assertEqual(write_workbook(path,[model],Path(folder)/'backups'),[]);self.assertEqual(first,path.read_bytes())
   with zipfile.ZipFile(path) as z:
    for name,content in before.items():
     if name not in ['xl/workbook.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml']:self.assertEqual(z.read(name),content,name)
    added=set(z.namelist())-set(before);self.assertEqual(len(added),1)
    sheet_bytes=z.read(added.pop());root=ET.fromstring(sheet_bytes)
    namespaces=dict(value for _,value in ET.iterparse(io.BytesIO(sheet_bytes),events=['start-ns']))
    for prefix in root.get('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable','').split():self.assertIn(prefix,namespaces)
    workbook=ET.fromstring(before['xl/workbook.xml'])
    template=next(s for s in workbook.find(f'{{{S}}}sheets') if s.get('name')=='Template')
    rels=ET.fromstring(before['xl/_rels/workbook.xml.rels'])
    target=next(r.get('Target') for r in rels if r.get('Id')==template.get(f'{{{R}}}id'))
    template_root=ET.fromstring(before[target.lstrip('/') if target.startswith('/') else 'xl/'+target])
    revision_uid='{http://schemas.microsoft.com/office/spreadsheetml/2014/revision}uid'
    self.assertNotEqual(root.get(revision_uid),template_root.get(revision_uid))
    for tag in ['cols','mergeCells','pageMargins']:
     self.assertEqual(ET.tostring(root.find(f'{{{S}}}{tag}')),ET.tostring(template_root.find(f'{{{S}}}{tag}')))
    value=lambda ref:root.find(f'.//{{{S}}}c[@r="{ref}"]/{{{S}}}v').text
    self.assertEqual(float(value('D12')),50);self.assertEqual(float(value('Q12')),10);self.assertEqual(float(value('S12')),0);self.assertEqual(float(value('S9')),0)
   model['values'][2][1]='Edited session name'
   self.assertEqual(len(write_workbook(path,[model],Path(folder)/'backups')),1)
   with zipfile.ZipFile(path) as z:self.assertEqual(len(z.namelist())-len(before),1)
   # Excel may convert inline metadata to shared strings when saving online.
   with zipfile.ZipFile(path) as z:parts={n:z.read(n) for n in z.namelist()}
   target=next(n for n in parts if n not in before)
   root=ET.fromstring(parts[target]);shared=ET.fromstring(parts['xl/sharedStrings.xml'])
   marker=next(c for c in root.findall(f'.//{{{S}}}c') if ''.join(c.itertext())==model['marker'])
   fingerprint_ref='B'+str(int(marker.get('r')[1:])+1)
   for cell in [marker,root.find(f'.//{{{S}}}c[@r="{fingerprint_ref}"]')]:
    value=''.join(cell.itertext());index=len(shared)
    ET.SubElement(ET.SubElement(shared,f'{{{S}}}si'),f'{{{S}}}t').text=value
    for child in list(cell):cell.remove(child)
    cell.set('t','s');ET.SubElement(cell,f'{{{S}}}v').text=str(index)
   parts[target]=ET.tostring(root);parts['xl/sharedStrings.xml']=ET.tostring(shared)
   with zipfile.ZipFile(path,'w') as z:
    for name,content in parts.items():z.writestr(name,content)
   self.assertEqual(write_workbook(path,[model],Path(folder)/'backups'),[])
if __name__=='__main__':unittest.main()

