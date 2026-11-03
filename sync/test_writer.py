import importlib.util,json,shutil,tempfile,unittest,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from write_workbook import write_workbook,S
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
    root=ET.fromstring(z.read(added.pop()))
    value=lambda ref:root.find(f'.//{{{S}}}c[@r="{ref}"]/{{{S}}}v').text
    self.assertEqual(float(value('D12')),50);self.assertEqual(float(value('Q12')),10);self.assertEqual(float(value('S12')),0);self.assertEqual(float(value('S9')),0)
   model['values'][2][1]='Edited session name'
   self.assertEqual(len(write_workbook(path,[model],Path(folder)/'backups')),1)
   with zipfile.ZipFile(path) as z:self.assertEqual(len(z.namelist())-len(before),1)
if __name__=='__main__':unittest.main()

