INSERT INTO drama (id, title, description, cover_url, status)
VALUES
(1, '逆光归来', '演示用短剧，覆盖冲突、反转和爽点。', '', 'active'),
(2, '那年冬至', '冬至这天，南昭宁与残疾的京家二少爷京烁闪婚。
  可新婚当晚，京烁对她说的第一句话竟是他一年后打算去死？
  既然如此，南昭宁决定抓紧享受，随便玩玩，顺便生个漂亮孩子！
  婚后，南昭宁像一束光照亮了京烁灰暗的世界，成为了他的救赎。
  在温暖又甜蜜的日常中两人彼此心动，双向奔赴。爱创造奇迹，确认心意的两人携手走向幸福的未来。', '', 'active')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  cover_url = excluded.cover_url,
  status = excluded.status;

INSERT INTO episode (
  id,
  drama_id,
  owner_user_id,
  episode_no,
  title,
  video_url,
  subtitle_url,
  subtitle_content,
  duration,
  analyze_status
)
VALUES
(
  1,
  1,
  NULL,
  1,
  '第 1 集 真相浮出水面',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  '',
  '1
00:00:02,000 --> 00:00:05,000
你竟敢羞辱她，今天我替她讨回公道。

2
00:00:08,000 --> 00:00:12,000
所有人都以为他输了，可真正的身份终于曝光。

3
00:00:16,000 --> 00:00:20,000
坏人终于被打脸，这一刻太爽了。',
  30,
  'pending'
),
(4, 2, NULL, 1, 'E001', 'D:\byte\upload\videos\E001.mp4', '', '', 186.50, 'pending'),
(5, 2, NULL, 2, 'E002', 'D:\byte\upload\videos\E002.mp4', '', '', 196.25, 'pending'),
(6, 2, NULL, 3, 'E003', 'D:\byte\upload\videos\E003.mp4', '', '', 135.62, 'pending'),
(7, 2, NULL, 4, 'E004', 'D:\byte\upload\videos\E004.mp4', '', '', 123.78, 'pending'),
(8, 2, NULL, 5, 'E005', 'D:\byte\upload\videos\E005.mp4', '', '', 156.10, 'pending'),
(9, 2, NULL, 6, 'E006', 'D:\byte\upload\videos\E006.mp4', '', '', 128.73, 'pending'),
(3, 2, NULL, 7, 'E007', 'D:\byte\upload\videos\E007.mp4', '', '', 121.00, 'pending')
ON CONFLICT(id) DO UPDATE SET
  drama_id = excluded.drama_id,
  owner_user_id = excluded.owner_user_id,
  episode_no = excluded.episode_no,
  title = excluded.title,
  video_url = excluded.video_url,
  subtitle_url = excluded.subtitle_url,
  subtitle_content = excluded.subtitle_content,
  duration = excluded.duration,
  analyze_status = excluded.analyze_status;

INSERT INTO interaction_template (highlight_type, button_text, effect, position, duration_ms)
VALUES
('conflict', '替她反击', 'anger_bar', 'bottom', 4000),
('reversal', '反转了', 'screen_flash', 'bottom', 4000),
('sweet', '磕到了', 'heart_rain', 'right', 4000),
('satisfying', '爽', 'boom_effect', 'bottom', 4000),
('suspense', '快更', 'countdown', 'bottom', 4000)
ON CONFLICT(highlight_type) DO UPDATE SET
  button_text = excluded.button_text,
  effect = excluded.effect,
  position = excluded.position,
  duration_ms = excluded.duration_ms;
