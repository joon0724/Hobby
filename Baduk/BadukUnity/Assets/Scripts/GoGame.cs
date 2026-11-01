using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Baduk
{
    public enum Stone { Empty, Black, White }
    public enum Phase { Playing, Scoring, Finished }
    public readonly struct Move
    {
        public readonly Stone Color;
        public readonly int Point;
        public Move(Stone color, int point) { Color = color; Point = point; }
    }
    public sealed class AreaScore
    {
        public int BlackStones, WhiteStones, BlackTerritory, WhiteTerritory, Neutral;
        public double Komi;
        public double Black => BlackStones + BlackTerritory;
        public double White => WhiteStones + WhiteTerritory + Komi;
        public string Result => (Black > White ? "흑" : "백") + " " + Math.Abs(Black - White).ToString("0.0", CultureInfo.InvariantCulture) + "집 승";
    }

    // Chinese area scoring, positional superko, no suicide, 7.5 komi.
    // Captured stones are displayed as information, never added to area scores.
    public sealed class GoGame
    {
        public int Size { get; }
        public double Komi { get; }
        public Stone Turn { get; private set; } = Stone.Black;
        public Phase Phase { get; private set; } = Phase.Playing;
        public int Passes { get; private set; }
        public int BlackCaptures { get; private set; }
        public int WhiteCaptures { get; private set; }
        public int LastPoint { get; private set; } = -1;
        public string Result { get; private set; } = "";
        readonly List<Move> moves = new List<Move>();
        public IReadOnlyList<Move> Moves => moves;
        Stone[] board;
        readonly HashSet<string> positions = new HashSet<string>();
        readonly HashSet<int> dead = new HashSet<int>();
        public GoGame(int size = 19, double komi = 7.5)
        {
            if (size < 2 || size > 19) throw new ArgumentOutOfRangeException(nameof(size));
            Size = size; Komi = komi; board = new Stone[size * size]; positions.Add(Key(board));
        }
        public Stone this[int point] => board[point];
        public bool IsDead(int point) => dead.Contains(point);
        public static Stone Opponent(Stone color) => color == Stone.Black ? Stone.White : Stone.Black;
        public IEnumerable<int> Neighbors(int p)
        {
            if (p % Size > 0) yield return p - 1;
            if (p % Size < Size - 1) yield return p + 1;
            if (p >= Size) yield return p - Size;
            if (p < Size * (Size - 1)) yield return p + Size;
        }
        string Key(Stone[] b)
        {
            var chars = new char[b.Length];
            for (int i = 0; i < b.Length; i++) chars[i] = (char)('0' + (int)b[i]);
            return new string(chars);
        }
        List<int> Group(Stone[] b, int start, out HashSet<int> liberties)
        {
            var group = new List<int>(); var seen = new HashSet<int>(); var todo = new Stack<int>();
            liberties = new HashSet<int>(); todo.Push(start); seen.Add(start);
            while (todo.Count > 0)
            {
                int p = todo.Pop(); group.Add(p);
                foreach (int n in Neighbors(p))
                    if (b[n] == Stone.Empty) liberties.Add(n);
                    else if (b[n] == b[start] && seen.Add(n)) todo.Push(n);
            }
            return group;
        }
        public List<int> GroupAt(int p) => board[p] == Stone.Empty ? new List<int>() : Group(board, p, out _);
        public int LibertiesAt(int p) { if (board[p] == Stone.Empty) return 0; Group(board, p, out var libs); return libs.Count; }
        public bool IsLegal(Stone actor, int p) => Prepare(actor, p, out _, out _, out _);
        bool Prepare(Stone actor, int p, out Stone[] next, out int captured, out string error)
        {
            next = null; captured = 0; error = "";
            if (Phase != Phase.Playing) { error = "지금은 착수할 수 없습니다."; return false; }
            if (actor != Turn) { error = "상대방 차례입니다."; return false; }
            if (p < 0 || p >= board.Length) { error = "바둑판 교차점에 놓아 주세요."; return false; }
            if (board[p] != Stone.Empty) { error = "이미 돌이 놓인 자리입니다."; return false; }
            next = (Stone[])board.Clone(); next[p] = actor;
            foreach (int n in Neighbors(p))
            {
                if (next[n] != Opponent(actor)) continue;
                var group = Group(next, n, out var libs);
                if (libs.Count == 0) { captured += group.Count; foreach (int q in group) next[q] = Stone.Empty; }
            }
            Group(next, p, out var ownLibs);
            if (ownLibs.Count == 0) { error = "자충: 활로가 없는 곳에는 놓을 수 없습니다."; return false; }
            if (positions.Contains(Key(next))) { error = "패: 이전과 같은 판 모양을 반복할 수 없습니다."; return false; }
            return true;
        }
        public bool Play(Stone actor, int p, out string error)
        {
            if (!Prepare(actor, p, out var next, out int captured, out error)) return false;
            board = next; positions.Add(Key(board));
            if (actor == Stone.Black) BlackCaptures += captured; else WhiteCaptures += captured;
            moves.Add(new Move(actor, p)); LastPoint = p; Passes = 0; Turn = Opponent(Turn); return true;
        }
        public bool Pass(Stone actor)
        {
            if (Phase != Phase.Playing || actor != Turn) return false;
            moves.Add(new Move(actor, -1)); LastPoint = -1; Turn = Opponent(Turn);
            if (++Passes == 2) Phase = Phase.Scoring;
            return true;
        }
        public void ToggleDead(int p)
        {
            if (Phase != Phase.Scoring || p < 0 || p >= board.Length || board[p] == Stone.Empty) return;
            bool remove = dead.Contains(p);
            foreach (int q in GroupAt(p)) { if (remove) dead.Remove(q); else dead.Add(q); }
        }
        public void SuggestDead(IEnumerable<int> points)
        {
            if (Phase != Phase.Scoring) return;
            dead.Clear();
            foreach (int p in points) if (p >= 0 && p < board.Length && board[p] != Stone.Empty)
                foreach (int q in GroupAt(p)) dead.Add(q);
        }
        public void Resume()
        {
            if (Phase != Phase.Scoring) return;
            dead.Clear(); Passes = 0; Phase = Phase.Playing;
        }
        public AreaScore Score()
        {
            var b = (Stone[])board.Clone(); foreach (int p in dead) b[p] = Stone.Empty;
            var score = new AreaScore { Komi = Komi }; var visited = new bool[b.Length];
            for (int p = 0; p < b.Length; p++)
            {
                if (b[p] == Stone.Black) { score.BlackStones++; continue; }
                if (b[p] == Stone.White) { score.WhiteStones++; continue; }
                if (visited[p]) continue;
                var todo = new Stack<int>(); todo.Push(p); visited[p] = true;
                int count = 0, borders = 0;
                while (todo.Count > 0)
                {
                    int q = todo.Pop(); count++;
                    foreach (int n in Neighbors(q))
                        if (b[n] == Stone.Empty) { if (!visited[n]) { visited[n] = true; todo.Push(n); } }
                        else borders |= b[n] == Stone.Black ? 1 : 2;
                }
                if (borders == 1) score.BlackTerritory += count;
                else if (borders == 2) score.WhiteTerritory += count;
                else score.Neutral += count;
            }
            return score;
        }
        public void FinishScoring() { if (Phase == Phase.Scoring) { Result = Score().Result; Phase = Phase.Finished; } }
        public void Resign(Stone actor)
        {
            if (Phase != Phase.Playing) return;
            Result = (Opponent(actor) == Stone.Black ? "흑" : "백") + " 불계승"; Phase = Phase.Finished;
        }
        public string Vertex(int p) => p < 0 ? "pass" : "ABCDEFGHJKLMNOPQRST"[p % Size] + (Size - p / Size).ToString(CultureInfo.InvariantCulture);
        public int ParseVertex(string vertex)
        {
            vertex = vertex.Trim().ToUpperInvariant(); if (vertex == "PASS") return -1;
            if (vertex.Length < 2) throw new FormatException("Invalid GTP vertex: " + vertex);
            int x = "ABCDEFGHJKLMNOPQRST".IndexOf(vertex[0]);
            if (!int.TryParse(vertex.Substring(1), out int row) || x < 0 || x >= Size || row < 1 || row > Size) throw new FormatException("Invalid GTP vertex: " + vertex);
            return (Size - row) * Size + x;
        }
        public string ToSgf(string opponent)
        {
            string escaped = opponent.Replace("\\", "\\\\").Replace("]", "\\]");
            var s = new StringBuilder("(;GM[1]FF[4]CA[UTF-8]AP[Baduk Studio:1.0]SZ[" + Size + "]KM[" + Komi.ToString(CultureInfo.InvariantCulture) + "]RU[Chinese]C[Positional superko. Opponent: " + escaped + "]");
            foreach (var m in moves)
            {
                s.Append(m.Color == Stone.Black ? ";B[" : ";W[");
                if (m.Point >= 0) { s.Append((char)('a' + m.Point % Size)); s.Append((char)('a' + m.Point / Size)); }
                s.Append(']');
            }
            if (Phase == Phase.Finished) s.Append("C[" + Result + "]");
            s.Append(')'); return s.ToString();
        }
    }
}
