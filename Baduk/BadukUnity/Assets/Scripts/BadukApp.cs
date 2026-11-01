using System;
using System.Collections;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Baduk
{
    public sealed class BadukApp : MonoBehaviour
    {
        const float W = 1280, H = 900;
        static readonly Color Ink = new Color32(23, 43, 39, 255), Paper = new Color32(239, 237, 226, 255);
        static readonly Color Muted = new Color32(157, 178, 161, 255), Gold = new Color32(213, 178, 112, 255);
        static readonly Color Panel = new Color32(32, 54, 47, 255);
        static readonly Color MyTerritory = new Color32(42, 168, 117, 255), OpponentTerritory = new Color32(224, 126, 69, 255);
        TerritoryEstimate territory;
        bool showTerritory = true;
        bool TerritoryVisible => screen == 2 && analysisOpen && showTerritory && !busy && !failed
            && game.Phase == Phase.Playing && analysisMove == game.Moves.Count && territory != null && territory.Size == game.Size;
        GoGame game = new GoGame(); KataGoClient engine;
        int screen, size = 19, rank = 10, session;
        bool dan, busy, failed, analysisOpen, confirmResign;
        Stone human = Stone.Black;
        string status = "한 수에 집중하는 시간", analysisText = "", saveNotice = "";
        float whiteWin, lead; int analysisMove = -1, recommendation = -1;
        Texture2D blackStone, whiteStone, disc, wood;
        Font font; GUIStyle textStyle, buttonStyle;
        public bool HumanCanMove => screen == 2 && !busy && !failed && !confirmResign && game.Phase == Phase.Playing && game.Turn == human;
        string RankLabel => rank + (dan ? "단" : "급");
        string Profile => "rank_" + rank + (dan ? "d" : "k");
        string ColorName(Stone c) => c == Stone.Black ? "흑" : "백";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap() { if (FindFirstObjectByType<BadukApp>() == null) new GameObject("Baduk Studio").AddComponent<BadukApp>(); }
        void Awake()
        {
            Application.targetFrameRate = 60; Application.runInBackground = true;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "맑은 고딕", "Arial" }, 20);
            blackStone = StoneTexture(false); whiteStone = StoneTexture(true); disc = DiscTexture(); wood = WoodTexture();
            if (Environment.GetCommandLineArgs().Contains("--smoke")) StartCoroutine(Smoke());
            else if (Environment.GetCommandLineArgs().Contains("--territory-smoke")) StartCoroutine(TerritorySmoke());
        }
        void OnDestroy() { session++; engine?.Dispose(); }
        void OnApplicationQuit() { session++; engine?.Dispose(); }
        public async Task StartMatch()
        {
            int ticket = ++session; engine?.Dispose(); engine = null;
            game = new GoGame(size); screen = 2; busy = true; failed = false; confirmResign = false;
            analysisOpen = false; analysisMove = -1; recommendation = -1; saveNotice = "";
            territory = null;
            status = "AI를 준비하고 있습니다…";
            string directory = Path.Combine(Application.streamingAssetsPath, "KataGo");
            string writable = Path.Combine(Application.persistentDataPath, "Engine");
            KataGoClient client = null;
            try
            {
                client = await Task.Run(() => new KataGoClient(directory, writable));
                if (ticket != session) { client.Dispose(); return; }
                engine = client;
                await client.Initialize(size, Profile);
                if (ticket != session) return;
                busy = false;
                if (game.Turn != human) await AiTurn(ticket); else status = "당신의 차례 · 교차점을 눌러 착수하세요";
            }
            catch (Exception e) { if (ticket == session) Fail(e); else client?.Dispose(); }
        }
        void Fail(Exception e)
        {
            Debug.LogError(e); failed = true; busy = false; engine?.Dispose();
            status = "AI 연결에 문제가 생겼습니다. 새 대국으로 다시 시작해 주세요.";
        }
        public async Task HumanMove(int point)
        {
            if (!HumanCanMove) return;
            if (!game.Play(human, point, out string error)) { status = error; return; }
            busy = true; analysisMove = -1; recommendation = -1; analysisOpen = false;
            int ticket = session;
            try
            {
                await engine.Command("play " + (human == Stone.Black ? "b " : "w ") + game.Vertex(point));
                if (ticket != session) return;
                await AiTurn(ticket);
            }
            catch (Exception e) { if (ticket == session) Fail(e); }
        }
        public async Task HumanPass()
        {
            if (!HumanCanMove || !game.Pass(human)) return;
            busy = true; analysisMove = -1; recommendation = -1; analysisOpen = false;
            int ticket = session;
            try
            {
                await engine.Command("play " + (human == Stone.Black ? "b" : "w") + " pass");
                if (ticket != session) return;
                if (game.Phase == Phase.Scoring) await PrepareScore(ticket); else await AiTurn(ticket);
            }
            catch (Exception e) { if (ticket == session) Fail(e); }
        }
        async Task AiTurn(int ticket)
        {
            if (ticket != session || game.Phase != Phase.Playing || game.Turn == human) return;
            busy = true; status = "AI가 다음 수를 생각하고 있습니다…";
            Stone actor = game.Turn;
            string vertex = await engine.Command("genmove " + (actor == Stone.Black ? "b" : "w"));
            if (ticket != session) return;
            if (vertex.Equals("resign", StringComparison.OrdinalIgnoreCase)) { game.Resign(actor); busy = false; status = game.Result; return; }
            int point = game.ParseVertex(vertex);
            if (point < 0) game.Pass(actor);
            else if (!game.Play(actor, point, out string error)) throw new InvalidOperationException("AI 착수 검증 실패: " + error);
            analysisMove = -1; recommendation = -1;
            if (game.Phase == Phase.Scoring) await PrepareScore(ticket);
            else { busy = false; status = point < 0 ? "AI가 패스했습니다 · 당신의 차례" : "당신의 차례 · AI의 마지막 수 " + vertex; }
        }
        async Task PrepareScore(int ticket)
        {
            status = "사석을 확인하고 있습니다…";
            string dead = await engine.Command("final_status_list dead");
            if (ticket != session) return;
            var points = dead.Split((char[])null, StringSplitOptions.RemoveEmptyEntries).Select(v => game.ParseVertex(v));
            game.SuggestDead(points); busy = false;
            status = "계가 준비 · 사석 표시를 확인해 주세요";
        }
        async Task ResumeMatch()
        {
            if (busy || failed || game.Phase != Phase.Scoring) return;
            game.Resume(); analysisMove = -1; analysisOpen = false;
            int ticket = session;
            try { if (game.Turn != human) await AiTurn(ticket); else status = "대국을 재개했습니다 · 당신의 차례"; }
            catch (Exception e) { if (ticket == session) Fail(e); }
        }
        public async Task Analyze()
        {
            if (busy || failed || screen != 2 || game.Phase != Phase.Playing) return;
            analysisOpen = true; showTerritory = true; territory = null; analysisMove = -1; busy = true; status = "현재 판과 예상 집을 분석하고 있습니다…";
            int ticket = session, move = game.Moves.Count;
            try
            {
                string result = await engine.Command("kata-raw-nn 0");
                if (ticket != session) return;
                var tokens = result.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                float Value(string key) { int i = Array.IndexOf(tokens, key); if (i < 0) throw new FormatException("Missing " + key); return float.Parse(tokens[i + 1], CultureInfo.InvariantCulture); }
                whiteWin = Value("whiteWin"); lead = Value("whiteLead");
                territory = TerritoryEstimate.Parse(result, game.Size);
                int start = Array.IndexOf(tokens, "policy") + 1; float best = -1; recommendation = -1;
                for (int p = 0; p < size * size && start > 0; p++)
                {
                    if (float.TryParse(tokens[start + p], NumberStyles.Float, CultureInfo.InvariantCulture, out float prob)
                        && !float.IsNaN(prob) && prob > best && game.IsLegal(game.Turn, p)) { best = prob; recommendation = p; }
                }
                int danger = 0; var seen = new System.Collections.Generic.HashSet<int>();
                for (int p = 0; p < size * size; p++) if (game[p] == human && !seen.Contains(p))
                {
                    foreach (int q in game.GroupAt(p)) seen.Add(q);
                    if (game.LibertiesAt(p) == 1) danger++;
                }
                analysisText = danger > 0 ? "내 돌 " + danger + "개 무리가 단수입니다.\n활로를 확보하거나 연결을 살펴보세요." : "단수에 몰린 내 돌은 없습니다.\n약한 돌의 연결과 큰 자리를 살펴보세요.";
                analysisMove = move; busy = false; status = "분석 완료 · 당신의 차례";
            }
            catch (Exception e) { if (ticket == session) Fail(e); }
        }
        void Menu()
        {
            session++; engine?.Dispose(); engine = null; screen = 1; busy = false; failed = false;
            confirmResign = false; analysisOpen = false; status = "새로운 상대를 만나 보세요";
        }
        void Export()
        {
            try
            {
                string dir = Path.Combine(Application.persistentDataPath, "Records"); Directory.CreateDirectory(dir);
                string path = Path.Combine(dir, "baduk-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".sgf");
                File.WriteAllText(path, game.ToSgf("KataGo HumanSL " + RankLabel), System.Text.Encoding.UTF8);
                saveNotice = "기보 저장 완료 · 저장 폴더 열기";
            }
            catch (Exception e) { saveNotice = "기보 저장 실패: " + e.Message; }
        }
        void OnGUI()
        {
            float scale = Mathf.Min(Screen.width / W, Screen.height / H);
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width - W * scale) / 2, (Screen.height - H * scale) / 2), Quaternion.identity, Vector3.one * scale);
            textStyle = new GUIStyle(GUI.skin.label) { font = font, fontSize = 18, wordWrap = true, richText = false };
            buttonStyle = new GUIStyle(GUI.skin.button) { font = font, fontSize = 17, alignment = TextAnchor.MiddleCenter };
            Fill(new Rect(0, 0, W, H), Ink);
            Label(44, 25, 600, 38, "한 수   /   BADUK STUDIO", 25, Paper);
            Label(890, 32, 350, 30, "CHINESE RULES    ·    KOMI 7.5", 13, Muted, TextAnchor.MiddleRight);
            Fill(new Rect(44, 83, 1192, 1), new Color(1, 1, 1, .12f));
            Label(44, 92, 720, 26, screen == 2 ? size + " × " + size + "    /    " + game.Moves.Count + "수" : "THE ART OF ONE MOVE", 13, Muted);
            DrawBoard();
            if (screen == 0) Welcome(); else if (screen == 1) Setup(); else MatchPanel();
            Fill(new Rect(44, 835, 1192, 1), new Color(1, 1, 1, .12f));
            if (Button(new Rect(44, 850, 136, 34), "◉  상황 분석", false, screen == 2 && !busy && !failed && game.Phase == Phase.Playing))
            { if (analysisOpen) analysisOpen = false; else _ = Analyze(); }
            Label(197, 850, 860, 34, status, 14, failed ? new Color(1, .65f, .5f) : Muted, TextAnchor.MiddleLeft);
            Label(1082, 853, 154, 26, "흑 선착 · 교대 착수", 12, Muted, TextAnchor.MiddleRight);
        }
        void Welcome()
        {
            Label(824, 142, 400, 30, "A QUIET PLACE TO THINK", 13, Gold);
            Label(820, 192, 410, 148, "생각을 놓고,\n한 수를 두다.", 42, Paper);
            Label(824, 373, 388, 86, "실제 바둑 규칙으로 즐기는 AI 대국.\n나에게 맞는 상대를 선택하고\n차분하게 다음 수를 찾아보세요.", 19, Muted);
            Fill(new Rect(824, 503, 382, 1), new Color(1, 1, 1, .15f));
            Label(824, 529, 388, 94, "20급 — 9단    인간 기보 기반 AI\n9 · 13 · 19줄    원하는 크기의 바둑판\n상황 분석       승률과 추천 수 확인", 16, Paper);
            if (Button(new Rect(824, 675, 382, 60), "게임 시작   →", true)) { screen = 1; status = "AI 난이도와 바둑판을 선택해 주세요"; }
            Label(824, 751, 382, 52, "KataGo HumanSL · 오프라인 대국", 13, Muted, TextAnchor.UpperCenter);
        }
        void Setup()
        {
            Label(824, 130, 390, 44, "대국 설정", 30, Paper);
            Label(824, 182, 390, 32, "01   상대 AI의 급수 / 단", 15, Gold);
            if (Button(new Rect(824, 224, 185, 38), "급", !dan)) { dan = false; rank = Mathf.Clamp(rank, 1, 20); }
            if (Button(new Rect(1021, 224, 185, 38), "단", dan)) { dan = true; rank = Mathf.Clamp(rank, 1, 9); }
            int count = dan ? 9 : 20;
            for (int i = 0; i < count; i++)
            {
                int value = dan ? i + 1 : 20 - i;
                if (Button(new Rect(824 + (i % 5) * 78, 275 + (i / 5) * 43, 70, 35), value + (dan ? "단" : "급"), rank == value)) rank = value;
            }
            Label(824, 455, 382, 52, "선택한 등급의 인간 기보 스타일을 모방합니다.\n공인 기력과의 일치를 보장하지 않습니다.", 12, Muted);
            Label(824, 514, 390, 28, "02   바둑판", 15, Gold);
            int[] sizes = { 9, 13, 19 };
            for (int i = 0; i < 3; i++) if (Button(new Rect(824 + i * 131, 551, 120, 38), sizes[i] + "줄", size == sizes[i])) size = sizes[i];
            Label(824, 610, 390, 28, "03   내 돌", 15, Gold);
            if (Button(new Rect(824, 647, 185, 38), "●  흑 · 먼저 두기", human == Stone.Black)) human = Stone.Black;
            if (Button(new Rect(1021, 647, 185, 38), "○  백 · 나중에 두기", human == Stone.White)) human = Stone.White;
            if (Button(new Rect(824, 719, 382, 57), RankLabel + " AI와 대국 시작   →", true)) _ = StartMatch();
            Label(824, 789, 390, 26, "중국식 면적 계가 · 덤 7.5집 · 위치 반복 금지", 12, Muted);
        }
        void MatchPanel()
        {
            Label(824, 130, 390, 37, game.Phase == Phase.Finished ? "대국 종료" : game.Phase == Phase.Scoring ? "사석 확인 · 계가" : "AI 대국", 29, Paper);
            Label(824, 178, 390, 30, "KataGo HumanSL    /    " + RankLabel, 15, Gold);
            PlayerCard(824, 232, human, "나", game.Turn == human && game.Phase == Phase.Playing);
            PlayerCard(1023, 232, GoGame.Opponent(human), "AI · " + RankLabel, game.Turn != human && game.Phase == Phase.Playing);
            if (game.Phase == Phase.Scoring || game.Phase == Phase.Finished)
            {
                var s = game.Score();
                Label(824, 365, 382, 44, game.Phase == Phase.Finished ? game.Result : "예상 계가  " + s.Result, 24, Paper);
                Label(824, 423, 382, 108, "흑  " + s.Black.ToString("0.0") + "   = 돌 " + s.BlackStones + " + 빈집 " + s.BlackTerritory + "\n백  " + s.White.ToString("0.0") + "   = 돌 " + s.WhiteStones + " + 빈집 " + s.WhiteTerritory + " + 덤 7.5\n공배  " + s.Neutral + "   ·   따낸 돌은 별도 가산하지 않음", 16, Muted);
                if (game.Phase == Phase.Scoring)
                {
                    Label(824, 540, 382, 95, "× 표시는 AI가 제안한 사석입니다.\n돌을 눌러 무리 전체의 사석 표시를 바꾸세요.\n판단이 어려우면 재개하여 끝까지 둡니다.", 15, Paper);
                    if (Button(new Rect(824, 649, 382, 48), "사석 확정 · 계가 완료", true, !busy && !failed)) { game.FinishScoring(); status = game.Result; }
                    if (Button(new Rect(824, 710, 382, 40), "대국 재개", false, !busy && !failed)) _ = ResumeMatch();
                }
                else if (Button(new Rect(824, 649, 382, 48), "다시 대국하기   →", true)) Menu();
            }
            else if (confirmResign)
            {
                Label(824, 369, 382, 75, "이 대국을 기권하시겠어요?\n기권하면 상대의 불계승으로 종료됩니다.", 19, Paper);
                if (Button(new Rect(824, 470, 185, 48), "기권", true)) { game.Resign(human); confirmResign = false; status = game.Result; }
                if (Button(new Rect(1021, 470, 185, 48), "계속 두기")) confirmResign = false;
            }
            else if (analysisOpen)
            {
                Label(824, 360, 382, 35, "현재 상황 분석", 23, Paper);
                if (analysisMove == game.Moves.Count)
                {
                    Label(824, 409, 382, 34, "흑 승률  " + ((1 - whiteWin) * 100).ToString("0.0") + "%", 24, Paper);
                    Fill(new Rect(824, 460, 382, 9), Paper); Fill(new Rect(824, 460, 382 * (1 - whiteWin), 9), Gold);
                    Label(824, 487, 382, 35, (lead >= 0 ? "백" : "흑") + " 약 " + Mathf.Abs(lead).ToString("0.0") + "집 우세", 20, Paper);
                    Label(824, 532, 382, 30, "추천 수    " + (recommendation < 0 ? "없음" : game.Vertex(recommendation)), 17, Gold);
                    TerritoryMarker(833, 583, 12, true);
                    Label(851, 569, 350, 28, "내 예상 집 (" + ColorName(human) + ")  " + territory.CountFor(game, human) + "곳", 17, Paper);
                    TerritoryMarker(833, 612, 12, false);
                    Label(851, 599, 350, 27, "상대 예상 집  " + territory.CountFor(game, GoGame.Opponent(human)) + "곳", 15, Muted);
                    Label(824, 632, 382, 32, "빈 교차점만 표시 · 미표시는 아직 불확실한 영역", 12, Muted);
                    Label(824, 662, 382, 46, "AI 예상 영역이며 확정된 집수가 아닙니다.\n" + analysisText.Split('\n')[0], 12, Muted);
                }
                else Label(824, 421, 382, 60, busy ? "AI가 판을 읽고 있습니다…" : "하단 버튼으로 다시 분석해 주세요.", 17, Muted);
                if (Button(new Rect(824, 727, 185, 40), showTerritory ? "집 표시 켜짐" : "집 표시 꺼짐", showTerritory, !busy && analysisMove == game.Moves.Count)) showTerritory = !showTerritory;
                if (Button(new Rect(1021, 727, 185, 40), "분석 닫기")) analysisOpen = false;
            }
            else
            {
                Label(824, 374, 382, 42, busy ? "AI 생각 중…" : failed ? "연결 확인 필요" : "당신의 차례입니다", 25, Paper);
                Label(824, 432, 382, 75, busy ? "잠시 판을 바라보며 다음 수를 준비하세요.\nAI의 착수가 끝나면 돌을 놓을 수 있습니다." : "교차점을 누르면 돌을 놓습니다.\n하단의 작은 버튼으로 상황을 분석할 수 있어요.", 16, Muted);
                Fill(new Rect(824, 536, 382, 1), new Color(1, 1, 1, .15f));
                Label(824, 557, 382, 64, "따낸 돌    흑 " + game.BlackCaptures + "   /   백 " + game.WhiteCaptures + "\n연속 패스  " + game.Passes + " / 2", 16, Paper);
                if (Button(new Rect(824, 650, 185, 46), "한 수 쉼 · 패스", false, HumanCanMove)) _ = HumanPass();
                if (Button(new Rect(1021, 650, 185, 46), "기권", false, HumanCanMove)) confirmResign = true;
                Label(824, 714, 382, 46, "두 번 연속 패스하면 사석을 확인하고 계가합니다.", 13, Muted);
            }
            if (Button(new Rect(824, 782, 119, 32), "새 대국")) Menu();
            if (Button(new Rect(954, 782, 119, 32), "기보 저장")) Export();
            if (saveNotice != "" && Button(new Rect(1084, 782, 122, 32), "저장 폴더")) Application.OpenURL(Path.Combine(Application.persistentDataPath, "Records"));
        }
        void PlayerCard(float x, float y, Stone color, string name, bool active)
        {
            Fill(new Rect(x, y, 183, 103), active ? new Color32(49, 77, 61, 255) : Panel);
            if (active) Fill(new Rect(x, y, 183, 3), Gold);
            GUI.DrawTexture(new Rect(x + 16, y + 20, 32, 32), color == Stone.Black ? blackStone : whiteStone);
            Label(x + 59, y + 21, 120, 30, name, 17, Paper);
            Label(x + 17, y + 63, 153, 26, ColorName(color) + (active ? "  ·  현재 차례" : "  ·  대기"), 13, active ? Gold : Muted);
        }
        void DrawBoard()
        {
            Rect outer = new Rect(44, 123, 700, 700);
            Fill(new Rect(51, 133, 700, 700), new Color(0, 0, 0, .24f)); GUI.DrawTexture(outer, wood);
            int n = screen == 2 ? game.Size : size; float step = 620f / (n - 1); float left = 84, top = 163;
            Color line = new Color(.28f, .20f, .11f, .68f);
            for (int i = 0; i < n; i++)
            {
                Fill(new Rect(left, top + i * step, 620, i == 0 || i == n - 1 ? 1.6f : 1), line);
                Fill(new Rect(left + i * step, top, i == 0 || i == n - 1 ? 1.6f : 1, 620), line);
                Label(left + i * step - 12, 132, 24, 22, "ABCDEFGHJKLMNOPQRST"[i].ToString(), 11, line, TextAnchor.MiddleCenter);
                Label(52, top + i * step - 11, 25, 22, (n - i).ToString(), 11, line, TextAnchor.MiddleCenter);
            }
            int[] stars = n == 19 ? new[] { 3, 9, 15 } : n == 13 ? new[] { 3, 6, 9 } : new[] { 2, 4, 6 };
            foreach (int x in stars) foreach (int y in stars)
                if (n == 19 || (x == n / 2 && y == n / 2) || (x != n / 2 && y != n / 2)) Dot(left + x * step, top + y * step, 6, line);
            float diameter = Mathf.Min(step * .92f, 53);
            if (screen == 2)
            {
                if (TerritoryVisible)
                {
                    for (int p = 0; p < n * n; p++)
                    {
                        Stone owner = territory.OwnerAt(game, p);
                        if (owner == Stone.Empty) continue;
                        float x = left + p % n * step, y = top + p / n * step;
                        Color tint = owner == human ? MyTerritory : OpponentTerritory;
                        tint.a = .18f;
                        Fill(new Rect(x - step * .43f, y - step * .43f, step * .86f, step * .86f), tint);
                        TerritoryMarker(x, y, Mathf.Min(14, step * .34f), owner == human);
                    }
                    Label(86, 792, 615, 23, "■ 내 예상 집    □ 상대 예상 집    · 빈 교차점 기준 / AI 추정", 12, Ink, TextAnchor.MiddleCenter);
                }
                for (int p = 0; p < n * n; p++)
                {
                    if (game[p] == Stone.Empty) continue;
                    float x = left + p % n * step, y = top + p / n * step;
                    GUI.color = game.IsDead(p) ? new Color(1, 1, 1, .35f) : Color.white;
                    GUI.DrawTexture(new Rect(x - diameter / 2, y - diameter / 2, diameter, diameter), game[p] == Stone.Black ? blackStone : whiteStone); GUI.color = Color.white;
                    if (game.IsDead(p)) Label(x - 15, y - 17, 30, 34, "×", 24, new Color(.7f, .2f, .1f), TextAnchor.MiddleCenter);
                    else if (p == game.LastPoint) Dot(x, y, 7, Gold);
                }
                if (analysisOpen && analysisMove == game.Moves.Count && recommendation >= 0)
                {
                    float x = left + recommendation % n * step, y = top + recommendation / n * step;
                    Dot(x, y, diameter * .67f, Ink); Label(x - 13, y - 13, 26, 26, "1", 15, Gold, TextAnchor.MiddleCenter);
                }
                Vector2 mouse = Event.current.mousePosition;
                int cx = Mathf.RoundToInt((mouse.x - left) / step), cy = Mathf.RoundToInt((mouse.y - top) / step);
                bool inBoard = cx >= 0 && cy >= 0 && cx < n && cy < n && new Rect(left - step / 2, top - step / 2, 620 + step, 620 + step).Contains(mouse);
                if (inBoard)
                {
                    int p = cy * n + cx;
                    if (HumanCanMove && game[p] == Stone.Empty)
                    { GUI.color = new Color(1, 1, 1, .4f); GUI.DrawTexture(new Rect(left + cx * step - diameter / 2, top + cy * step - diameter / 2, diameter, diameter), human == Stone.Black ? blackStone : whiteStone); GUI.color = Color.white; }
                    if (Event.current.type == EventType.MouseDown && Event.current.button == 0)
                    {
                        if (game.Phase == Phase.Scoring && !busy && !failed) game.ToggleDead(p);
                        else if (HumanCanMove) _ = HumanMove(p);
                        Event.current.Use();
                    }
                }
            }
            else
            {
                int[,] layout = { {3,3,1},{15,15,2},{15,3,1},{3,15,2},{4,14,1},{4,15,2},{5,14,1},{3,13,2},{14,3,1},{14,4,2},{13,3,1},{15,5,2} };
                if (n == 19) for (int i = 0; i < layout.GetLength(0); i++) GUI.DrawTexture(new Rect(left + layout[i,0] * step - diameter/2, top + layout[i,1] * step - diameter/2, diameter, diameter), layout[i,2] == 1 ? blackStone : whiteStone);
                Label(285, 792, 220, 22, "대국 미리보기", 11, line, TextAnchor.MiddleCenter);
            }
        }
        void Fill(Rect r, Color c) { GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = Color.white; }
        void TerritoryMarker(float x, float y, float diameter, bool mine)
        {
            var r = new Rect(x - diameter / 2, y - diameter / 2, diameter, diameter);
            if (mine) Fill(r, MyTerritory);
            else
            {
                Fill(new Rect(r.x, r.y, r.width, 2), OpponentTerritory);
                Fill(new Rect(r.x, r.yMax - 2, r.width, 2), OpponentTerritory);
                Fill(new Rect(r.x, r.y, 2, r.height), OpponentTerritory);
                Fill(new Rect(r.xMax - 2, r.y, 2, r.height), OpponentTerritory);
            }
        }
        void Dot(float x, float y, float d, Color c) { GUI.color = c; GUI.DrawTexture(new Rect(x-d/2, y-d/2, d, d), disc); GUI.color = Color.white; }
        void Label(float x, float y, float w, float h, string text, int fontSize, Color color, TextAnchor anchor = TextAnchor.UpperLeft)
        { textStyle.fontSize = fontSize; textStyle.normal.textColor = color; textStyle.alignment = anchor; GUI.Label(new Rect(x,y,w,h), text, textStyle); }
        bool Button(Rect r, string label, bool primary = false, bool enabled = true)
        {
            bool hover = r.Contains(Event.current.mousePosition);
            Color c = primary ? Gold : (hover && enabled ? new Color32(58, 82, 65, 255) : Panel);
            Fill(r, enabled ? c : new Color(c.r, c.g, c.b, .35f));
            buttonStyle.normal.background = null; buttonStyle.hover.background = null; buttonStyle.active.background = null;
            buttonStyle.normal.textColor = primary ? Ink : (enabled ? Paper : Muted * .65f);
            buttonStyle.hover.textColor = buttonStyle.normal.textColor; buttonStyle.active.textColor = buttonStyle.normal.textColor;
            bool previous = GUI.enabled; GUI.enabled = enabled; bool clicked = GUI.Button(r, label, buttonStyle); GUI.enabled = previous; return clicked;
        }
        static Texture2D DiscTexture()
        {
            var t = new Texture2D(64,64,TextureFormat.RGBA32,false);
            for (int y=0;y<64;y++) for(int x=0;x<64;x++) { float d = Vector2.Distance(new Vector2(x+.5f,y+.5f),new Vector2(32,32)); t.SetPixel(x,y,new Color(1,1,1,Mathf.Clamp01(32-d))); } t.Apply(); return t;
        }
        static Texture2D StoneTexture(bool white)
        {
            var t = new Texture2D(128,128,TextureFormat.RGBA32,false);
            for(int y=0;y<128;y++) for(int x=0;x<128;x++)
            {
                float nx=(x-62f)/58, ny=(y-66f)/58, d=Mathf.Sqrt(nx*nx+ny*ny);
                float alpha=Mathf.Clamp01((1-d)*35); float light=Mathf.Clamp01(1-Vector2.Distance(new Vector2(nx,ny),new Vector2(-.35f,.4f))*.6f);
                float v=white ? .75f+.24f*light : .035f+.19f*light*light;
                t.SetPixel(x,y,new Color(v,white ? v*.99f : v*1.07f,white ? v*.96f : v*1.09f,alpha));
            } t.Apply(); return t;
        }
        static Texture2D WoodTexture()
        {
            var t=new Texture2D(512,512,TextureFormat.RGB24,false);
            for(int y=0;y<512;y++) for(int x=0;x<512;x++)
            {
                float grain=Mathf.Sin(x*.63f+Mathf.Sin(y*.014f)*2)*.008f + Mathf.PerlinNoise(x*.22f,y*.008f)*.025f;
                t.SetPixel(x,y,new Color(.78f+grain,.62f+grain,.39f+grain));
            } t.Apply(); return t;
        }
        IEnumerator TerritorySmoke()
        {
            string dir = Path.GetFullPath(Path.Combine(Application.dataPath, "../../Screenshots/Territory"));
            Directory.CreateDirectory(dir);
            size = 19; human = Stone.Black;
            var start = StartMatch(); while (!start.IsCompleted) yield return null;
            if (failed) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),status); Application.Quit(1); yield break; }
            // Legal alternating moves enclosing opposite corners, with an open centre.
            string[] moves = { "A16", "Q4", "B16", "R4", "C16", "S4", "D16", "T4", "D17", "Q3", "D18", "Q2", "D19", "Q1" };
            foreach (string vertex in moves)
            {
                Stone color = game.Turn;
                if (!game.Play(color, game.ParseVertex(vertex), out string error))
                { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),error); Application.Quit(1); yield break; }
                var play = engine.Command("play " + (color == Stone.Black ? "b " : "w ") + vertex);
                while (!play.IsCompleted) yield return null;
                if (play.IsFaulted) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),play.Exception.ToString()); Application.Quit(1); yield break; }
            }
            var analysis = Analyze(); while (!analysis.IsCompleted) yield return null;
            if (!TerritoryVisible || territory.OwnerAt(game, game.ParseVertex("A19")) != Stone.Black
                || territory.OwnerAt(game, game.ParseVertex("T1")) != Stone.White || game.Moves.Count != moves.Length)
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Ownership orientation or non-mutating analysis failed"); Application.Quit(1); yield break; }
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"01-black-territory.png"));
            yield return new WaitForSeconds(1); showTerritory = false;
            if (TerritoryVisible) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Hide failed"); Application.Quit(1); yield break; }
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"02-hidden.png"));
            yield return new WaitForSeconds(1); analysisOpen = false; showTerritory = true;
            if (TerritoryVisible) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Close failed"); Application.Quit(1); yield break; }
            game.Play(Stone.Black, game.ParseVertex("K10"), out _);
            var middle = engine.Command("play b K10"); while (!middle.IsCompleted) yield return null;
            human = Stone.White;
            analysis = Analyze(); while (!analysis.IsCompleted) yield return null;
            if (!TerritoryVisible || territory.OwnerAt(game, game.ParseVertex("T1")) != human || !HumanCanMove)
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"White-player territory failed"); Application.Quit(1); yield break; }
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"03-white-territory.png"));
            yield return new WaitForSeconds(1);
            int legal = Enumerable.Range(0,size*size).First(p => game.IsLegal(human,p));
            var turn = HumanMove(legal);
            if (TerritoryVisible) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Stale territory visible after move"); Application.Quit(1); yield break; }
            while (!turn.IsCompleted) yield return null;
            if (failed || TerritoryVisible || game.Moves.Count != 17)
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"AI reply / invalidation failed"); Application.Quit(1); yield break; }
            foreach (string shot in new[] { "01-black-territory.png", "02-hidden.png", "03-white-territory.png" })
                if (!File.Exists(Path.Combine(dir,shot))) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Missing screenshot"); Application.Quit(1); yield break; }
            File.WriteAllText(Path.Combine(dir,"PASS.txt"),"PASS: real KataGo 19x19 ownership orientation, black/white perspective, empty-point overlay, hide/close controls, non-mutating analysis, stale overlay removed after move, legal AI reply, three screenshots.\n" + DateTime.UtcNow.ToString("O"));
            Application.Quit(0);
        }
        IEnumerator Smoke()
        {
            string dir = Path.GetFullPath(Path.Combine(Application.dataPath,"../../Screenshots")); Directory.CreateDirectory(dir);
            yield return new WaitForSeconds(2); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"01-welcome.png"));
            yield return new WaitForSeconds(1); screen=1;
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"02-setup.png"));
            yield return new WaitForSeconds(1); size=19; rank=10; human=Stone.Black;
            var start=StartMatch(); while(!start.IsCompleted) yield return null;
            if(failed) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),status); Application.Quit(1); yield break; }
            var turn=HumanMove(game.ParseVertex("D4"));
            int count=game.Moves.Count; _=HumanMove(game.ParseVertex("Q16")); _=HumanPass();
            if(game.Moves.Count!=count) throw new Exception("Double-click turn lock failed");
            while(!turn.IsCompleted) yield return null;
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"03-game.png"));
            var a=Analyze(); while(!a.IsCompleted) yield return null;
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"04-analysis.png"));
            yield return new WaitForSeconds(1);
            if(failed || game.Moves.Count!=2 || analysisMove!=2) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),status); Application.Quit(1); yield break; }
            analysisOpen = false;
            game.Pass(Stone.Black); var pb = engine.Command("play b pass"); while(!pb.IsCompleted) yield return null;
            game.Pass(Stone.White); var pw = engine.Command("play w pass"); while(!pw.IsCompleted) yield return null;
            busy = true; var scoring = PrepareScore(session); while(!scoring.IsCompleted) yield return null;
            if (pb.IsFaulted || pw.IsFaulted || scoring.IsFaulted || game.Phase != Phase.Scoring)
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Endgame flow failed"); Application.Quit(1); yield break; }
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"05-scoring.png"));
            yield return new WaitForSeconds(1); var resume = ResumeMatch(); while(!resume.IsCompleted) yield return null;
            if (!HumanCanMove) { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Resume failed"); Application.Quit(1); yield break; }
            int legal = Enumerable.Range(0,size*size).First(p => game.IsLegal(human,p));
            var oldTurn = HumanMove(legal); Menu(); size = 9; human = Stone.White;
            var replacement = StartMatch(); while(!replacement.IsCompleted || !oldTurn.IsCompleted) yield return null;
            if(failed || game.Size != 9 || game.Moves.Count != 1 || !HumanCanMove)
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"New-match cancellation or white-first flow failed"); Application.Quit(1); yield break; }
            yield return new WaitForSeconds(1); ScreenCapture.CaptureScreenshot(Path.Combine(dir,"06-white-player.png"));
            yield return new WaitForSeconds(1);
            string[] shots = {"01-welcome.png","02-setup.png","03-game.png","04-analysis.png","05-scoring.png","06-white-player.png"};
            if(shots.Any(s => !File.Exists(Path.Combine(dir,s))))
            { File.WriteAllText(Path.Combine(dir,"FAILED.txt"),"Runtime checks passed, but screenshot capture failed. Run with a visible game window."); Application.Quit(1); yield break; }
            File.WriteAllText(Path.Combine(dir,"PASS.txt"),"Native Unity runtime PASS: HumanSL startup, 19x19 human move and legal AI reply, rapid-click/pass lock, non-mutating analysis, double-pass scoring, resume, replacement match while AI pending, 9x9 white-player AI first turn, six screenshots.\n" + DateTime.UtcNow.ToString("O"));
            Application.Quit(0);
        }
    }
}
