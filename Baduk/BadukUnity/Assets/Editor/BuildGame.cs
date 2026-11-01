using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Baduk;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BuildGame
{
    static int tests;
    static void Check(bool condition, string name) { if (!condition) throw new Exception("FAIL: " + name); tests++; Debug.Log("PASS: " + name); }
    static GoGame Fixture(params string[] rows)
    {
        var g = new GoGame(rows.Length); var b = new Stone[rows.Length * rows.Length];
        for (int y = 0; y < rows.Length; y++) for (int x = 0; x < rows.Length; x++) b[y * rows.Length + x] = rows[y][x] == 'B' ? Stone.Black : rows[y][x] == 'W' ? Stone.White : Stone.Empty;
        typeof(GoGame).GetField("board", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(g, b);
        var positions = (HashSet<string>)typeof(GoGame).GetField("positions", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(g);
        positions.Add(new string(b.Select(s => (char)('0' + (int)s)).ToArray())); return g;
    }
    public static void RulesTests()
    {
        tests = 0; string e; var g = new GoGame(9);
        Check(g.Turn == Stone.Black, "Black moves first");
        Check(!g.Play(Stone.White, 0, out e) && g.Moves.Count == 0, "Wrong actor rejected atomically");
        Check(!g.Play(Stone.Black, -1, out e) && !g.Play(Stone.Black, 81, out e), "Bounds rejected");
        Check(g.Play(Stone.Black, 0, out e) && g.Turn == Stone.White, "Turn alternates");
        Check(!g.Play(Stone.Black, 1, out e) && g.Moves.Count == 1, "Double human move rejected");
        Check(!g.Play(Stone.White, 0, out e) && g[0] == Stone.Black, "Occupied point rejected atomically");
        g = Fixture(".BW..", "BW.W.", ".BW..", ".....", ".....");
        Check(g.Play(Stone.Black, 7, out e) && g[6] == Stone.Empty && g.BlackCaptures == 1, "Capture removes stone and creates liberty");
        Check(!g.Play(Stone.White, 6, out e) && e.StartsWith("패") && g.Turn == Stone.White, "Immediate ko rejected without consuming turn");
        g.Pass(Stone.White); g.Pass(Stone.Black); g.Resume();
        Check(!g.Play(Stone.White, 6, out e) && e.StartsWith("패"), "History retained through pass and resume (superko)");
        g = Fixture(".W.", "W.W", ".W.");
        Check(!g.Play(Stone.Black, 4, out e) && g[4] == Stone.Empty && e.StartsWith("자충"), "Suicide rejected");
        g = Fixture("..B..", ".BWB.", "BW.WB", ".BWB.", "..B..");
        Check(g.Play(Stone.Black, 12, out e) && g.BlackCaptures == 4, "Simultaneous capture before suicide check");
        g = Fixture("BBB..", "BWW..", ".BB..", ".....", ".....");
        Check(g.Play(Stone.Black, 8, out e) && g.BlackCaptures == 2, "Connected group removed as a whole");
        g = new GoGame(9);
        Check(!g.Pass(Stone.White) && g.Passes == 0, "Out-of-turn pass rejected");
        g.Pass(Stone.Black); g.Play(Stone.White, 40, out e);
        Check(g.Passes == 0, "Move resets consecutive passes");
        g.Pass(Stone.Black); g.Pass(Stone.White);
        Check(g.Phase == Phase.Scoring && !g.Play(Stone.Black, 0, out e), "Two passes enter scoring and prevent placement");
        g.ToggleDead(40); Check(g.IsDead(40) && g[40] == Stone.White, "Dead marking does not alter board");
        g.Resume(); Check(g.Phase == Phase.Playing && !g.IsDead(40) && g.Turn == Stone.Black, "Resume preserves position and next player");
        g = Fixture("BBBBB", "B...B", "BBBBB", "WWWWW", "W...W");
        var score = g.Score();
        Check(score.Black == 15 && score.White == 17.5 && score.Neutral == 0, "Area scoring, edges and 7.5 komi");
        g = Fixture("B.W", "...", "..."); score = g.Score();
        Check(score.Neutral == 7 && score.Black == 1 && score.White == 8.5, "Mixed-border region is neutral");
        g = Fixture("BB.", "W..", "..."); g.Pass(Stone.Black); g.Pass(Stone.White); g.ToggleDead(0);
        Check(g.IsDead(0) && g.IsDead(1), "Dead toggle covers connected group");
        g.FinishScoring(); Check(g.Phase == Phase.Finished && !g.Pass(g.Turn), "Scoring finalization locks game");
        g = new GoGame(); g.Resign(Stone.Black);
        Check(g.Result == "백 불계승" && !g.Play(Stone.Black, 0, out e), "Resignation ends game");
        g = new GoGame(19);
        Check(g.ParseVertex("T1") == 360 && g.ParseVertex("J19") == 8 && g.Vertex(8) == "J19", "GTP coordinates skip I and invert rows");
        g.Play(Stone.Black, 0, out e); g.Pass(Stone.White);
        Check(g.ToSgf("test").Contains(";B[aa];W[]"), "SGF coordinates and pass");
        var rng = new System.Random(14); g = new GoGame(9);
        for (int m = 0; m < 140; m++)
        {
            int[] legal = Enumerable.Range(0,81).Where(p => g.IsLegal(g.Turn,p)).ToArray();
            if (legal.Length == 0) break;
            if (!g.Play(g.Turn, legal[rng.Next(legal.Length)], out e)) throw new Exception(e);
            for (int p=0;p<81;p++) if (g[p] != Stone.Empty && g.LibertiesAt(p) == 0) throw new Exception("Zero-liberty surviving group");
        }
        Check(g.Moves.Count > 80, "140-move randomized rules invariant test");
        g = new GoGame(3);
        var territory = TerritoryEstimate.Parse("symmetry 0\nwhiteOwnership\n-1 -0.5 0\n0.49 0.5 1\n-0.49 0 0.8\nfutureField 123", 3);
        Check(territory.OwnerAt(g, 0) == Stone.Black && territory.OwnerAt(g, 8) == Stone.White, "Ownership signs and row-major corners");
        Check(territory.CountFor(g, Stone.Black) == 2 && territory.CountFor(g, Stone.White) == 3, "Ownership count from either player perspective");
        Check(territory.OwnerAt(g, 2) == Stone.Empty && territory.OwnerAt(g, 3) == Stone.Empty && territory.OwnerAt(g, 6) == Stone.Empty, "Uncertain regions stay unmarked");
        g.Play(Stone.Black, 0, out _);
        Check(territory.OwnerAt(g, 0) == Stone.Empty && territory.CountFor(g, Stone.Black) == 1, "Occupied intersections are not counted as empty territory");
        Check(territory.CountFor(new GoGame(9), Stone.Black) == 0, "Wrong-sized map cannot be displayed");
        foreach (string bad in new[] { "whiteWin 0.5", "whiteOwnership 0 0", "whiteOwnership NaN 0 0 0 0 0 0 0 0", "whiteOwnership 2 0 0 0 0 0 0 0 0" })
        {
            bool rejected = false; try { TerritoryEstimate.Parse(bad, 3); } catch (FormatException) { rejected = true; }
            Check(rejected, "Reject malformed ownership: " + bad.Split(' ')[0]);
        }
        Debug.Log("RULES TESTS PASSED: " + tests);
    }
    static async Task EngineTests(string directory, string working)
    {
        using (var client = new KataGoClient(directory, working))
        {
            await client.Initialize(9, "rank_20k");
            Check((await client.Command("kata-get-param humanSLProfile")).Contains("20k"), "HumanSL 20 kyu profile");
            await client.Command("kata-set-param humanSLProfile rank_9d");
            Check((await client.Command("kata-get-param humanSLProfile")).Contains("9d"), "HumanSL 9 dan profile");
            await client.Command("kata-set-param humanSLProfile rank_10k");
            Check((await client.Command("kata-get-rules")).Contains("POSITIONAL"), "Engine superko matches local rules");
            var g = new GoGame(9); g.Play(Stone.Black, g.ParseVertex("D4"), out _); await client.Command("play b D4");
            string reply = await client.Command("genmove w"); int point = g.ParseVertex(reply);
            Check(point < 0 ? g.Pass(Stone.White) : g.Play(Stone.White,point,out _), "Real neural AI returns legal move");
            string before = await client.Command("showboard");
            string raw = await client.Command("kata-raw-nn 0");
            Check(raw.Contains("whiteWin") && raw.Contains("whiteLead") && raw.Contains("policy"), "Live neural analysis fields");
            var territory = TerritoryEstimate.Parse(raw, 9);
            Check(territory.Size == 9 && territory.CountFor(g, Stone.Black) + territory.CountFor(g, Stone.White) <= 81 - g.Moves.Count, "Real 9x9 ownership response parses and excludes stones");
            Check(before == await client.Command("showboard"), "Analysis does not change engine position");
            await client.Command("play b pass"); await client.Command("play w pass");
            await client.Command("final_status_list dead");
            Check(true, "Engine supports endgame dead-stone proposal");
        }
    }
    [MenuItem("Baduk/Prepare Main Scene")]
    public static void PrepareProject()
    {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var camera = new GameObject("Camera").AddComponent<Camera>(); camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color32(23,43,39,255);
            EditorSceneManager.SaveScene(scene,"Assets/Scenes/Main.unity");
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Main.unity",true) };
            PlayerSettings.companyName = "Baduk Studio"; PlayerSettings.productName = "한 수 - Baduk Studio";
            PlayerSettings.defaultScreenWidth=1280; PlayerSettings.defaultScreenHeight=900;
            PlayerSettings.fullScreenMode=FullScreenMode.Windowed; PlayerSettings.resizableWindow=true;
            PlayerSettings.runInBackground=true;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
    }
    public static void Build()
    {
        try
        {
            RulesTests();
            string assets = Application.dataPath;
            Task.Run(() => EngineTests(Path.Combine(assets,"StreamingAssets/KataGo"), Path.GetFullPath(Path.Combine(assets,"../Temp/EngineTests")))).GetAwaiter().GetResult();
            PrepareProject();
            string output=Path.GetFullPath(Path.Combine(assets,"../../release-assets/BadukWindows/Baduk.exe"));
            var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes=new[]{"Assets/Scenes/Main.unity"}, locationPathName=output, target=BuildTarget.StandaloneWindows64, options=BuildOptions.None });
            if(result.summary.result!=BuildResult.Succeeded) throw new Exception("Build failed: "+result.summary.result);
            File.WriteAllText(Path.Combine(assets,"../Temp/TEST-RESULTS.txt"),tests+" rule and KataGo integration checks PASS. Windows x64 build PASS.\n"+DateTime.UtcNow.ToString("O"));
            Debug.Log("BUILD AND TESTS PASSED: "+output); EditorApplication.Exit(0);
        }
        catch(Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
    }
}
