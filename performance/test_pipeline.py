"""Regression tests use isolated ledgers, never live measurements."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import pipeline

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patch = patch.multiple(pipeline, ROOT=self.root, LAB=self.root, DATA=self.root/'data', POSTS=self.root/'data/posts.csv', OBS=self.root/'data/observations.csv')
        self.patch.start()
    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()
    def put(self, name, value):
        f = self.root/name
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(value))
    def test_account_cohorts_reject_unknown_and_mixed_accounts(self):
        current = {'platform':'tiktok','url':'https://www.tiktok.com/@universalvibes_/video/123'}
        old = {'platform':'tiktok','url':'https://www.tiktok.com/@twistorychannel/video/456'}
        self.assertTrue(pipeline.comparable_account([current,current]))
        self.assertFalse(pipeline.comparable_account([current,old]))
        self.assertFalse(pipeline.comparable_account([{'platform':'youtube'}]))
        self.assertTrue(pipeline.comparable_account([{'platform':'youtube','account_id':'verified-channel-id'}]))
    def test_report_separates_old_and_current_tiktok_accounts(self):
        posts = [{'slug':'old','platform':'tiktok','url':'https://www.tiktok.com/@twistorychannel/video/1'},
                 {'slug':'new','platform':'tiktok','url':'https://www.tiktok.com/@universalvibes_/video/2'}]
        pipeline.write_csv(pipeline.POSTS,pipeline.POST_FIELDS,posts)
        pipeline.write_csv(pipeline.OBS,pipeline.OBS_FIELDS,[{'slug':'old','platform':'tiktok','views':2}, {'slug':'new','platform':'tiktok','views':100}])
        pipeline.report()
        text = (self.root/'report.md').read_text()
        self.assertIn('TikTok — account @twistorychannel', text)
        self.assertIn('TikTok — account @universalvibes_', text)
        self.assertNotIn('median 51', text)
    def test_slot_arrays_bank_provenance_and_precise_duration(self):
        self.put('episodes/test/04-edit/edit.json', {'scenes':[{'slots':{'photos':['local',{'id':'bank:real'}],'bigWord':'TITLE'}},{'slots':{'bigWord':'ENDING'}}]})
        self.put('episodes/test/05-assets/manifest.json', {'assets':{'local':{'source':{'provider':'generated'}}}})
        self.put('banks/images/index.json', {'assets':{'real':{'source':{'provider':'museum'}}}})
        self.put('episodes/test/06-render/post/post.json', {'facts':{'durationSeconds':65.42}})
        r = pipeline.episode_features('test')
        self.assertEqual((r['image_count'],r['sourced_images'],r['generated_images'],r['text_only_scenes']), (2,1,1,1))
        self.assertEqual(r['duration_s'],65.42)
    def test_sync_retains_imports_and_reads_legacy_tiktok_label(self):
        pipeline.write_csv(pipeline.POSTS,pipeline.POST_FIELDS,[{'slug':'imported','platform':'tiktok','url':'https://example.com/old','published_at':'known'}])
        history = self.root/'history/STORIES.md'
        history.parent.mkdir()
        history.write_text('| 2026-10-01 | test | Title | source | noir/bone | voice | 65.42s | Hook | video | YT: https://example.com/y · tiktok: https://example.com/t |\n')
        pipeline.sync()
        rows = pipeline.read_csv(pipeline.POSTS)
        self.assertEqual(len(rows),3)
        self.assertEqual(next(r for r in rows if r['slug']=='imported')['published_at'],'known')
        self.assertEqual(next(r for r in rows if r['slug']=='test' and r['platform']=='tiktok')['duration_s'],'65.42')
        self.assertIn('reels_skip_rate',pipeline.OBS_FIELDS)

if __name__ == '__main__':
    unittest.main()
