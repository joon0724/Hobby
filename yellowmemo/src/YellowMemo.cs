using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using System.Windows.Interop;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Forms = System.Windows.Forms;

namespace YellowMemo {
    [DataContract] public class Folder {
        // Retained only to read and round-trip notebooks from older versions.
        [DataMember] public string Id { get; set; }
        [DataMember] public string Name { get; set; }
    }
    [DataContract] public class Note {
        [DataMember] public string Id;
        [DataMember] public string FolderId;
        [DataMember] public string Title;
        [DataMember] public string Body;
        [DataMember] public string BodyRtf;
        [DataMember] public double EmptyFontSize;
        [DataMember] public bool EmptyBold;
        [DataMember] public DateTime Updated;
        [DataMember] public long CreationOrder;
        public Note Snapshot() { return (Note)MemberwiseClone(); }
    }
    [DataContract] public class Notebook {
        [DataMember] public List<Folder> Folders = new List<Folder>();
        [DataMember] public List<Note> Notes = new List<Note>();
        [DataMember] public string LastNote;
        [DataMember] public bool Pinned;
        [DataMember] public bool HasWidgetPosition;
        [DataMember] public double WidgetLeft;
        [DataMember] public double WidgetTop;
        [DataMember] public double WidgetWidth;
        [DataMember] public double WidgetHeight;
        [DataMember] public int EditorVersion;
        [DataMember] public string SortMode;
        public Notebook Snapshot() {
            var copy = (Notebook)MemberwiseClone();
            copy.Notes = Notes.Select(n => n.Snapshot()).ToList(); copy.Folders = Folders.ToList(); return copy;
        }
    }
    public static class NoteView {
        public static bool Initialize(Notebook book) {
            bool changed = false;
            // Legacy notebooks did not record creation order. Freeze their previous display order once.
            var missing = book.Notes.Where(n => n.CreationOrder <= 0).OrderByDescending(n => n.Updated).ToList();
            long highest = book.Notes.Select(n => n.CreationOrder).DefaultIfEmpty(0).Max();
            for (int i = 0; i < missing.Count; i++) { missing[i].CreationOrder = highest + missing.Count - i; changed = true; }
            if (book.SortMode != "created" && book.SortMode != "size") { book.SortMode = "created"; changed = true; }
            return changed;
        }
        public static long NextOrder(Notebook book) { return book.Notes.Select(n => n.CreationOrder).DefaultIfEmpty(0).Max()+1; }
        public static int TextSize(Note n) { return (n.Body ?? "").Length; }
        public static IEnumerable<Note> Sorted(Notebook book) {
            return book.SortMode == "size"
                ? book.Notes.OrderByDescending(TextSize).ThenByDescending(n => n.CreationOrder).ThenBy(n => n.Id,StringComparer.Ordinal)
                : book.Notes.OrderByDescending(n => n.CreationOrder).ThenBy(n => n.Id,StringComparer.Ordinal);
        }
        public static bool Matches(Note n, string query) {
            string q = (query ?? "").Trim();
            return q.Length == 0 || (n.Title ?? "").IndexOf(q,StringComparison.OrdinalIgnoreCase) >= 0 || (n.Body ?? "").IndexOf(q,StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
    public class Store {
        public readonly string PathName;
        public Store(string path) { PathName = path; }
        public Notebook Load() {
            using (var s = File.OpenRead(PathName)) {
                var book = (Notebook)new DataContractJsonSerializer(typeof(Notebook)).ReadObject(s);
                Validate(book); return book;
            }
        }
        public static void Validate(Notebook b) {
            if (b == null || b.Folders == null || b.Notes == null || b.Folders.Count == 0)
                throw new InvalidDataException("메모 데이터 형식이 올바르지 않습니다.");
            if (b.Folders.Any(f => f == null || String.IsNullOrWhiteSpace(f.Id) || String.IsNullOrWhiteSpace(f.Name)) ||
                b.Folders.Select(f => f.Id).Distinct().Count() != b.Folders.Count ||
                b.Notes.Any(n => n == null || String.IsNullOrWhiteSpace(n.Id) || !b.Folders.Any(f => f.Id == n.FolderId)) ||
                b.Notes.Select(n => n.Id).Distinct().Count() != b.Notes.Count)
                throw new InvalidDataException("메모 데이터가 올바르지 않습니다.");
        }
        public void Save(Notebook b) {
            Validate(b);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(PathName));
            string temp = PathName + ".tmp";
            using (var s = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)) {
                new DataContractJsonSerializer(typeof(Notebook)).WriteObject(s, b); s.Flush(true);
            }
            if (File.Exists(PathName)) File.Replace(temp, PathName, PathName + ".bak");
            else File.Move(temp, PathName);
        }
    }
    public static class NotebookLocation {
        public static string UserPath(string localAppData) { return System.IO.Path.Combine(localAppData,"YellowMemo","data","widget-notes.json"); }
        // Called with the destination lifetime lock held. Never replace an existing user notebook.
        public static void ImportLegacy(string destination, string appDirectory) {
            if (File.Exists(destination) || File.Exists(destination + ".bak")) return;
            string folder = System.IO.Path.Combine(appDirectory,"data");
            foreach (string name in new[] { "widget-notes.json", "notes.json" }) {
                string source = System.IO.Path.Combine(folder,name);
                if (!File.Exists(source) && !File.Exists(source + ".bak")) continue;
                using (var guard = new FileStream(source + ".lock",FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
                    string valid = source;
                    try { new Store(valid).Load(); }
                    catch { valid = source + ".bak"; new Store(valid).Load(); }
                    Directory.CreateDirectory(System.IO.Path.GetDirectoryName(destination));
                    // Preserve source bytes, including formatting and unknown legacy metadata.
                    string staging = destination + ".importing";
                    File.Copy(valid,staging,true); new Store(staging).Load();
                    File.Move(staging,destination);
                }
                return;
            }
        }
    }
    // Lines belong to the scrollable document coordinate system, including wrapped lines.
    public class RuledPaper : FrameworkElement {
        public double Offset;
        public double Spacing = 22;
        protected override void OnRender(DrawingContext dc) {
            dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(255, 246, 185)), null, new Rect(RenderSize));
            var line = new Pen(new SolidColorBrush(Color.FromRgb(223, 208, 134)), 0.65);
            double first = 8 + Spacing - (Offset % Spacing);
            if (Offset >= Spacing) first -= Spacing;
            for (double y = first; y < ActualHeight; y += Spacing)
                if (y >= 0) dc.DrawLine(line, new Point(24, y), new Point(Math.Max(24, ActualWidth - 24), y));
            dc.DrawLine(new Pen(new SolidColorBrush(Color.FromRgb(231, 173, 132)), 0.7), new Point(27,0), new Point(27,ActualHeight));
        }
    }
    public class MemoWindow : Window {
        Notebook book; Store store; Note current; bool loading, dirty, compact;
        Grid root; ColumnDefinition notesColumn; Border notesPanel;
        ListBox notes; TextBox title, search; RichTextBox editor; ComboBox notePicker, fontSizePicker, sortPicker;
        ToggleButton boldButton; bool syncingFormat, normalizing;
        bool editPending, titlePending, formatPending;
        TextComposition composition;
        Task<Exception> saveTask; long revision; int richExports;
        const double DefaultTextSize = 40.0 / 3.0;
        const double HeaderHeight = 44;
        class NoteChoice { public string Id { get; set; } public string Name { get; set; } }
        TextBlock status, count, heading; Button compactButton; RuledPaper paper;
        DispatcherTimer saveTimer; double wideWidth = 820, wideHeight = 640;
        Forms.NotifyIcon tray; bool exitRequested, sessionEnding, ready, adjusting, folded;
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hwnd, int index, int value);
        const double DefaultWidgetWidth = 380, DefaultWidgetHeight = 460;
        double widgetWidth = DefaultWidgetWidth, widgetHeight = DefaultWidgetHeight;
        Grid outer;
        readonly Brush ink = BrushOf("#38382E"), muted = BrushOf("#8A8978");
        public static Brush BrushOf(string s) { return (Brush)new BrushConverter().ConvertFromString(s); }
        public MemoWindow(Store store, Notebook book) {
            this.store = store; this.book = book;
            Title = "한 장 · 노란 메모"; Width = 820; Height = 640; MinWidth = 640; MinHeight = 440;
            WindowStartupLocation = WindowStartupLocation.Manual; Background = BrushOf("#F7F7F0");
            WindowStyle = WindowStyle.None; ShowInTaskbar = false; ResizeMode = ResizeMode.CanResize;
            FontFamily = new FontFamily("Malgun Gothic"); FontSize = 13; Foreground = ink;
            bool upgradeSettings = NoteView.Initialize(book);
            if (book.EditorVersion < 4 || book.Pinned) upgradeSettings = true;
            book.Pinned = false; book.EditorVersion = 4;
            Topmost = false;
            Build();
            saveTimer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(900) };
            saveTimer.Tick += delegate { saveTimer.Stop(); SaveInBackground(); };
            TextCompositionManager.AddPreviewTextInputStartHandler(this,CompositionStarted);
            TextCompositionManager.AddPreviewTextInputUpdateHandler(this,CompositionStarted);
            TextCompositionManager.AddPreviewTextInputHandler(this,CompositionFinished);
            if (upgradeSettings) Changed();
            current = book.Notes.FirstOrDefault(n => n.Id == book.LastNote) ?? NoteView.Sorted(book).FirstOrDefault();
            RefreshNotes(); ShowNote(current);
            if (book.WidgetWidth >= 320 && book.WidgetWidth <= 1600) widgetWidth = book.WidgetWidth;
            if (book.WidgetHeight >= 300 && book.WidgetHeight <= 1600) widgetHeight = book.WidgetHeight;
            ToggleCompact();
            var area = SystemParameters.WorkArea;
            Left = book.HasWidgetPosition ? book.WidgetLeft : area.Right - Width - 24;
            Top = book.HasWidgetPosition ? book.WidgetTop : area.Bottom - Height - 24;
            PreviewKeyDown += Keys;
            SourceInitialized += delegate {
                var source = (HwndSource)PresentationSource.FromVisual(this); source.AddHook(WindowMessage);
                SetWindowLong(source.Handle,-20,(GetWindowLong(source.Handle,-20) | 0x80) & ~0x40000);
                SetWindowLong(source.Handle,-16,GetWindowLong(source.Handle,-16) & ~0x30000);
                KeepOnScreen();
            };
            Loaded += delegate { ready = true; SetupTray(); RememberWidget(); };
            LocationChanged += delegate { RememberWidget(); };
            SizeChanged += delegate { RememberWidget(); };
            StateChanged += delegate { if (WindowState != WindowState.Normal) Dispatcher.BeginInvoke(new Action(delegate { if (!exitRequested) WindowState = WindowState.Normal; })); };
            Application.Current.SessionEnding += OnSessionEnding;
            SystemParameters.StaticPropertyChanged += OnDesktopChanged;
            Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e) {
                Capture();
                if (!exitRequested && !sessionEnding) { e.Cancel = true; Save(false); if (!compact) ToggleCompact(); if (!folded) ToggleFold(); return; }
                if (!Save(!sessionEnding) && !sessionEnding) { e.Cancel = true; exitRequested = false; }
            };
            Closed += delegate { saveTimer.Stop(); if (tray != null) { tray.Visible = false; tray.Dispose(); } Application.Current.SessionEnding -= OnSessionEnding; SystemParameters.StaticPropertyChanged -= OnDesktopChanged; };
        }
        TextBlock Label(string text, double size, Brush brush) { return new TextBlock { Text = text, FontSize = size, Foreground = brush, VerticalAlignment = VerticalAlignment.Center }; }
        Button Btn(string text, RoutedEventHandler handler, bool accent) {
            var b = new Button { Content = text, Padding = new Thickness(12,8,12,8), Margin = new Thickness(0,0,6,0), Cursor = Cursors.Hand,
                Background = BrushOf(accent ? "#E4BE46" : "#EEEFE7"), Foreground = ink, BorderThickness = new Thickness(0), FontSize = 12 };
            b.Click += handler; return b;
        }
        StackPanel Row() { return new StackPanel { Orientation = Orientation.Horizontal }; }
        void Build() {
            outer = new Grid { Background = BrushOf("#F7F7F0") }; outer.RowDefinitions.Add(new RowDefinition { Height = new GridLength(HeaderHeight) }); outer.RowDefinitions.Add(new RowDefinition()); Content = new Border { Background = BrushOf("#F7F7F0"), BorderBrush = BrushOf("#DFD59D"), BorderThickness = new Thickness(1), Child = outer };
            var top = new Grid { Margin = new Thickness(13,0,7,0), Background = Brushes.Transparent }; outer.Children.Add(top);
            top.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e) { if (e.ClickCount == 2) { ToggleFold(); return; } if (e.LeftButton == MouseButtonState.Pressed) { DragMove(); KeepOnScreen(); RememberWidget(); } };
            top.ColumnDefinitions.Add(new ColumnDefinition()); top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var brand = Row(); brand.Cursor = Cursors.SizeAll; brand.ToolTip = "끌어서 이동 · 두 번 누르면 접기/펼치기";
            brand.Children.Add(new Border { Width = 22, Height = 26, Background = BrushOf("#E7C54E"), CornerRadius = new CornerRadius(3), Margin = new Thickness(0,0,8,0), Child = Label(" ≡",17,ink) });
            brand.Children.Add(Label("한 장",16,ink)); top.Children.Add(brand);
            var actions = Row(); actions.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(actions,1); top.Children.Add(actions);
            var add = Btn("＋",delegate { if (folded) ToggleFold(); NewNote(); },false); add.ToolTip = "새 메모 (Ctrl+N)"; actions.Children.Add(add);
            compactButton = Btn("작은 창", delegate { ToggleCompact(); }, false); actions.Children.Add(compactButton);
            var menuButton = Btn("⋯",delegate {},false); menuButton.ToolTip = "접기 / 위치 / 앱 종료"; actions.Children.Add(menuButton);
            var menu = new ContextMenu();
            AddMenu(menu,"메모 접기 / 펼치기",delegate { ToggleFold(); });
            AddMenu(menu,"화면 오른쪽 아래로",delegate { DockCorner(); });
            AddMenu(menu,"현재 메모 삭제",delegate { DeleteNote(); });
            menu.Items.Add(new Separator()); AddMenu(menu,"앱 종료",delegate { RequestExit(); });
            menuButton.Click += delegate { menu.PlacementTarget = menuButton; menu.Placement = PlacementMode.Bottom; menu.IsOpen = true; };
            root = new Grid(); Grid.SetRow(root,1); outer.Children.Add(root);
            notesColumn = new ColumnDefinition { Width = new GridLength(245) };
            root.ColumnDefinitions.Add(notesColumn); root.ColumnDefinitions.Add(new ColumnDefinition());
            notesPanel = new Border { Background = BrushOf("#FAFAF5"), BorderBrush = BrushOf("#E4E5DB"), BorderThickness = new Thickness(0,0,1,0), Padding = new Thickness(17,23,17,16) }; root.Children.Add(notesPanel);
            var ng = new DockPanel(); notesPanel.Child = ng;
            var nhead = new StackPanel(); DockPanel.SetDock(nhead,Dock.Top); ng.Children.Add(nhead);
            heading = Label("모든 메모",17,ink); heading.FontWeight = FontWeights.SemiBold; heading.Margin = new Thickness(0,0,0,16); nhead.Children.Add(heading);
            nhead.Children.Add(Btn("＋ 새 메모", delegate { NewNote(); }, true));
            var sortLabel = Label("정렬 방식",10,muted); sortLabel.Margin = new Thickness(0,14,0,5); nhead.Children.Add(sortLabel);
            sortPicker = new ComboBox { Padding = new Thickness(6,5,6,5), FontSize = 11, Margin = new Thickness(0,0,0,12), ToolTip = "작성 순: 수정해도 위치 유지 / 크기 순: 본문 글자 수가 많은 순" };
            sortPicker.Items.Add("작성 순 · 최근 생성한 메모"); sortPicker.Items.Add("크기 순 · 본문 글자 많은 순");
            sortPicker.SelectedIndex = book.SortMode == "size" ? 1 : 0; nhead.Children.Add(sortPicker);
            sortPicker.SelectionChanged += delegate { if (!loading) { CompleteComposition(); Capture(); book.SortMode = sortPicker.SelectedIndex == 1 ? "size" : "created"; Changed(); RefreshNotes(); } };
            search = new TextBox { Margin = new Thickness(0,5,0,12), Padding = new Thickness(9,8,9,8), Background = Brushes.White, BorderBrush = BrushOf("#E1E3D7"), BorderThickness = new Thickness(1), ToolTip = "제목 또는 본문에 검색어가 포함된 모든 메모 (Ctrl+F)" };
            nhead.Children.Add(Label("메모 검색",10,muted)); nhead.Children.Add(search); search.TextChanged += delegate { if (!loading) { Capture(); RefreshNotes(); } };
            notes = new ListBox { Background = Brushes.Transparent, BorderThickness = new Thickness(0) }; StyleLists(notes); ng.Children.Add(notes);
            notes.SelectionChanged += delegate { if (loading) return; var item = notes.SelectedItem as ListBoxItem; if (item != null) { Capture(); ShowNote(book.Notes.First(n => n.Id == (string)item.Tag)); } };
            var page = new Grid { Background = BrushOf("#FFF6B9") }; Grid.SetColumn(page,1); root.Children.Add(page);
            page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); page.RowDefinitions.Add(new RowDefinition()); page.RowDefinitions.Add(new RowDefinition { Height = new GridLength(28) });
            var ph = new StackPanel { Margin = new Thickness(16,8,16,5) }; page.Children.Add(ph);
            ph.Children.Add(Label("메모 선택",10,muted));
            notePicker = new ComboBox { FontSize = 11, Padding = new Thickness(4,3,4,3), Margin = new Thickness(0,3,0,0), DisplayMemberPath = "Name", SelectedValuePath = "Id", ToolTip = "모든 메모에서 선택" }; ph.Children.Add(notePicker);
            notePicker.SelectionChanged += delegate { var selected = notePicker.SelectedItem as NoteChoice; if (!loading && selected != null) { Capture(); ShowNote(book.Notes.First(n => n.Id == selected.Id)); } };
            title = new TextBox { FontSize = 18, FontWeight = FontWeights.SemiBold, Background = Brushes.Transparent, BorderThickness = new Thickness(0), Padding = new Thickness(0,6,0,4), MaxLength = 150, ToolTip = "메모 제목" }; ph.Children.Add(title); title.TextChanged += delegate { if (!loading && current != null) { titlePending = true; Changed(); } };
            var format = new DockPanel { Margin = new Thickness(0,2,0,0) }; ph.Children.Add(format);
            var fontTools = Row(); format.Children.Add(fontTools); fontTools.Children.Add(Label("글자  ",10,muted));
            fontSizePicker = new ComboBox { Width = 53, FontSize = 11, Padding = new Thickness(4,3,4,3), ToolTip = "글자 크기: 선택한 글자 또는 앞으로 입력할 글자에 적용", IsEditable = false };
            foreach (double size in new double[] { 8,9,10,11,12,14,16,18,20,24,28,32 }) fontSizePicker.Items.Add(size);
            fontTools.Children.Add(fontSizePicker); fontTools.Children.Add(Label(" pt  ",10,muted));
            fontSizePicker.SelectionChanged += delegate { if (!syncingFormat && !loading && current != null && fontSizePicker.SelectedItem != null) ApplyTextSize((double)fontSizePicker.SelectedItem); };
            boldButton = new ToggleButton { Content = "가", FontWeight = FontWeights.Bold, FontSize = 13, Padding = new Thickness(7,2,7,2), Focusable = false, ToolTip = "굵게 (Ctrl+B)", Background = BrushOf("#EEE9C2"), BorderBrush = BrushOf("#D6C888") }; fontTools.Children.Add(boldButton);
            boldButton.Click += delegate { ApplyBold(boldButton.IsChecked == true); };
            var body = new Grid { ClipToBounds = true }; Grid.SetRow(body,1); page.Children.Add(body);
            paper = new RuledPaper { IsHitTestVisible = false }; body.Children.Add(paper);
            editor = new RichTextBox { Background = Brushes.Transparent, BorderThickness = new Thickness(0), Padding = new Thickness(36,8,16,12), FontFamily = new FontFamily("Malgun Gothic"), FontSize = DefaultTextSize, Foreground = ink, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, AcceptsTab = true, IsUndoEnabled = true, SpellCheck = { IsEnabled = false } };
            editor.Document = Document(""); body.Children.Add(editor);
            // Never modify the FlowDocument or serialize RTF from TextChanged: IME owns it here.
            editor.TextChanged += delegate(object sender, TextChangedEventArgs e) { if (!loading && !normalizing && current != null) { editPending = true; if (e.Changes.Count == 0) formatPending = true; Changed(); } };
            editor.SelectionChanged += delegate { if (!loading && !normalizing && composition == null && !editPending) SyncFormat(); };
            editor.AddHandler(ScrollViewer.ScrollChangedEvent, new ScrollChangedEventHandler(delegate(object s, ScrollChangedEventArgs e) { paper.Offset = e.VerticalOffset; paper.InvalidateVisual(); }));
            DataObject.AddPastingHandler(editor, delegate(object s, DataObjectPastingEventArgs e) { if (e.SourceDataObject.GetDataPresent(DataFormats.UnicodeText)) { string text = e.SourceDataObject.GetData(DataFormats.UnicodeText) as string; e.DataObject = new DataObject(DataFormats.UnicodeText,text ?? ""); } else e.CancelCommand(); });
            var foot = new Grid { Margin = new Thickness(26,0,24,0) }; Grid.SetRow(foot,2); page.Children.Add(foot);
            status = Label("자동 저장 준비",10,muted); foot.Children.Add(status); count = Label("0자",10,muted); count.HorizontalAlignment = HorizontalAlignment.Right; foot.Children.Add(count);
        }
        void StyleLists(ListBox list) {
            ScrollViewer.SetHorizontalScrollBarVisibility(list,ScrollBarVisibility.Disabled);
            var style = new Style(typeof(ListBoxItem)); style.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(9,10,9,10))); style.Setters.Add(new Setter(Control.MarginProperty,new Thickness(0,0,0,5))); style.Setters.Add(new Setter(Control.HorizontalContentAlignmentProperty,HorizontalAlignment.Stretch));
            style.Setters.Add(new Setter(Control.BorderThicknessProperty,new Thickness(0))); list.ItemContainerStyle = style;
        }
        FlowDocument Document(string text) {
            var doc = new FlowDocument { PagePadding = new Thickness(36,8,16,12), FontFamily = new FontFamily("Malgun Gothic"), FontSize = DefaultTextSize, LineHeight = 22, LineStackingStrategy = LineStackingStrategy.BlockLineHeight };
            var ps = new Style(typeof(Paragraph)); ps.Setters.Add(new Setter(Block.MarginProperty,new Thickness(0))); ps.Setters.Add(new Setter(Block.LineHeightProperty,22.0)); ps.Setters.Add(new Setter(Block.LineStackingStrategyProperty,LineStackingStrategy.BlockLineHeight)); doc.Resources.Add(typeof(Paragraph),ps);
            var lines = (text ?? "").Replace("\r\n","\n").Replace("\r","\n").Split('\n');
            foreach (string line in lines) doc.Blocks.Add(new Paragraph(new Run(line)) { Margin = new Thickness(0), LineHeight = 22, LineStackingStrategy = LineStackingStrategy.BlockLineHeight });
            return doc;
        }
        string RichBody() {
            richExports++;
            using (var stream = new MemoryStream()) { new TextRange(editor.Document.ContentStart,editor.Document.ContentEnd).Save(stream,DataFormats.Rtf); return Convert.ToBase64String(stream.ToArray()); }
        }
        void NormalizeLines() {
            if (normalizing || composition != null) return;
            normalizing = true;
            try {
                double max = DefaultTextSize;
                for (var p = editor.Document.ContentStart; p != null && p.CompareTo(editor.Document.ContentEnd) < 0; p = p.GetNextContextPosition(LogicalDirection.Forward)) {
                    if (p.GetPointerContext(LogicalDirection.Forward) == TextPointerContext.Text) { var element = p.Parent as TextElement; if (element != null) max = Math.Max(max,element.FontSize); }
                }
                if (editor.Selection.IsEmpty) { object size = editor.Selection.GetPropertyValue(TextElement.FontSizeProperty); if (size is double) max = Math.Max(max,(double)size); }
                double spacing = Math.Max(22,Math.Ceiling(max * 1.6));
                if (editor.Document.LineHeight != spacing) editor.Document.LineHeight = spacing;
                if (editor.Document.LineStackingStrategy != LineStackingStrategy.BlockLineHeight) editor.Document.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
                foreach (var p in Paragraphs(editor.Document.Blocks)) {
                    if (p.Margin != new Thickness(0)) p.Margin = new Thickness(0);
                    if (p.LineHeight != spacing) p.LineHeight = spacing;
                    if (p.LineStackingStrategy != LineStackingStrategy.BlockLineHeight) p.LineStackingStrategy = LineStackingStrategy.BlockLineHeight;
                }
                paper.Spacing = spacing; paper.InvalidateVisual();
            } finally { normalizing = false; }
        }
        IEnumerable<Paragraph> Paragraphs(BlockCollection blocks) {
            foreach (var block in blocks) {
                var p = block as Paragraph; if (p != null) yield return p;
                var section = block as Section; if (section != null) foreach (var child in Paragraphs(section.Blocks)) yield return child;
            }
        }
        void SyncFormat() {
            if (editor == null || fontSizePicker == null || syncingFormat) return;
            syncingFormat = true;
            try {
                object size = editor.Selection.GetPropertyValue(TextElement.FontSizeProperty);
                double pt = size is double ? Math.Round((double)size * 0.75,2) : -1;
                fontSizePicker.SelectedItem = fontSizePicker.Items.Cast<double>().Where(n => Math.Abs(n-pt)<0.1).Cast<object>().FirstOrDefault();
                object weight = editor.Selection.GetPropertyValue(TextElement.FontWeightProperty);
                boldButton.IsChecked = weight == DependencyProperty.UnsetValue ? (bool?)null : weight is FontWeight && (FontWeight)weight == FontWeights.Bold;
            } finally { syncingFormat = false; }
        }
        void ApplyTextSize(double points) {
            if (current == null || points < 8 || points > 32) return;
            editor.Focus(); editor.BeginChange();
            try {
                if (Body().Length == 0) { current.EmptyFontSize = points * 4.0/3.0; editor.Document.FontSize = current.EmptyFontSize; foreach (var p in Paragraphs(editor.Document.Blocks)) p.FontSize = current.EmptyFontSize; Changed(); }
                editor.Selection.ApplyPropertyValue(TextElement.FontSizeProperty,points * 4.0/3.0); NormalizeLines();
            } finally { editor.EndChange(); }
            NormalizeLines(); Capture(); SyncFormat();
        }
        void ApplyBold(bool bold) {
            if (current == null) return;
            editor.Focus(); editor.BeginChange();
            try {
                if (Body().Length == 0) { current.EmptyBold = bold; editor.Document.FontWeight = bold ? FontWeights.Bold : FontWeights.Normal; foreach (var p in Paragraphs(editor.Document.Blocks)) p.FontWeight = editor.Document.FontWeight; Changed(); }
                editor.Selection.ApplyPropertyValue(TextElement.FontWeightProperty,bold ? FontWeights.Bold : FontWeights.Normal); NormalizeLines();
            } finally { editor.EndChange(); }
            NormalizeLines(); Capture(); SyncFormat();
        }
        string Body() { string s = new TextRange(editor.Document.ContentStart, editor.Document.ContentEnd).Text; if (s.EndsWith("\r\n")) s = s.Substring(0,s.Length-2); return s.Replace("\r\n","\n"); }
        void CompositionStarted(object sender, TextCompositionEventArgs e) { composition = e.TextComposition; }
        void CompositionFinished(object sender, TextCompositionEventArgs e) {
            if (composition == e.TextComposition) composition = null;
            // Restart the debounce only; the final input has not reached the editor yet.
            if (dirty) { saveTimer.Stop(); saveTimer.Start(); }
        }
        void CompleteComposition() {
            if (composition != null) { TextCompositionManager.CompleteComposition(composition); composition = null; }
        }
        void Capture() {
            if (loading || normalizing || current == null || composition != null) return;
            if (!editPending && !titlePending) return;
            bool refreshTitle = titlePending;
            if (formatPending) NormalizeLines();
            string body = editPending ? Body() : current.Body;
            string rich = editPending ? RichBody() : current.BodyRtf;
            editPending = titlePending = formatPending = false;
            if (current.Title != title.Text || current.Body != body || current.BodyRtf != rich) { current.Title = title.Text; current.Body = body; current.BodyRtf = rich; current.Updated = DateTime.Now; Changed(); }
            count.Text = (body ?? "").Length.ToString("N0") + "자";
            RefreshAfterEdit(refreshTitle); SyncFormat();
        }
        void Changed() { dirty = true; revision++; status.Text = "저장 대기…"; status.Foreground = muted; saveTimer.Stop(); saveTimer.Start(); }
        void Saved() { dirty = false; status.Text = "저장됨 · " + DateTime.Now.ToString("HH:mm"); status.Foreground = muted; }
        void SaveInBackground() {
            if (composition != null || saveTask != null) { saveTimer.Start(); return; }
            Capture(); saveTimer.Stop(); if (!dirty) return;
            Notebook snapshot = book.Snapshot(); long version = revision;
            var task = Task.Factory.StartNew<Exception>(delegate { try { store.Save(snapshot); return null; } catch (Exception ex) { return ex; } });
            saveTask = task;
            task.ContinueWith(delegate(Task<Exception> finished) {
                Dispatcher.BeginInvoke(new Action(delegate {
                    if (saveTask != finished) return;
                    saveTask = null;
                    if (finished.Result != null) { status.Text = "저장 실패 · Ctrl+S로 재시도"; status.Foreground = Brushes.Firebrick; }
                    else if (revision == version) Saved();
                    else { saveTimer.Stop(); saveTimer.Start(); }
                }));
            });
        }
        bool Save(bool explicitSave) {
            CompleteComposition(); Capture(); saveTimer.Stop();
            if (saveTask != null) { saveTask.Wait(); saveTask = null; }
            if (!dirty) return true;
            try { store.Save(book); Saved(); return true; }
            catch (Exception ex) { status.Text = "저장 실패 · Ctrl+S로 재시도"; status.Foreground = Brushes.Firebrick; if (explicitSave) MessageBox.Show(this,"메모를 저장하지 못했습니다. 창을 닫기 전에 다시 저장해 주세요.\n\n" + ex.Message,"저장 오류",MessageBoxButton.OK,MessageBoxImage.Error); return false; }
        }
        string NoteTitle(Note n) { return String.IsNullOrWhiteSpace(n.Title) ? "제목 없는 메모" : n.Title; }
        object NoteCard(Note n) {
            var stack = new StackPanel(); stack.Children.Add(new TextBlock { Text = NoteTitle(n), FontSize = 13, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis });
            stack.Children.Add(new TextBlock { Text = String.IsNullOrEmpty(n.Body) ? "내용을 적어보세요" : n.Body.Substring(0,Math.Min(160,n.Body.Length)).Replace('\n',' '), Foreground = muted, FontSize = 11, Margin = new Thickness(0,7,0,8), TextTrimming = TextTrimming.CharacterEllipsis });
            stack.Children.Add(new TextBlock { Text = NoteView.TextSize(n).ToString("N0") + "자 · 수정 " + n.Updated.ToString("MM.dd HH:mm"), Foreground = muted, FontSize = 10 }); return stack;
        }
        void UpdateNoteLabel() { foreach (ListBoxItem i in notes.Items) if ((string)i.Tag == current.Id) { i.Content = NoteCard(current); break; } }
        void RefreshAfterEdit(bool titleChanged) {
            if (book.SortMode == "size" || !String.IsNullOrWhiteSpace(search.Text)) RefreshNotes();
            else { UpdateNoteLabel(); if (titleChanged) RefreshPickers(); }
        }
        void RefreshPickers() {
            bool was = loading; loading = true;
            notePicker.ItemsSource = NoteView.Sorted(book).Select(n => new NoteChoice { Id = n.Id, Name = NoteTitle(n) }).ToList();
            notePicker.SelectedValue = current == null ? null : current.Id;
            notePicker.IsEnabled = book.Notes.Count > 0; loading = was;
        }
        void RefreshNotes() {
            bool was = loading; loading = true; notes.Items.Clear(); string q = search.Text.Trim();
            heading.Text = "모든 메모 · " + book.Notes.Count;
            foreach (var n in NoteView.Sorted(book).Where(n => NoteView.Matches(n,q))) {
                var i = new ListBoxItem { Tag = n.Id, Content = NoteCard(n) }; notes.Items.Add(i); if (current != null && n.Id == current.Id) notes.SelectedItem = i;
            }
            if (notes.Items.Count == 0) notes.Items.Add(new ListBoxItem { IsEnabled = false, Content = new TextBlock { Text = q.Length == 0 ? "첫 메모를 만들어보세요." : "검색 결과가 없습니다.", Foreground = muted, TextWrapping = TextWrapping.Wrap, FontSize = 12 } });
            loading = was; RefreshPickers();
        }
        void ShowNote(Note n) {
            CompleteComposition(); Capture();
            editPending = titlePending = formatPending = false;
            loading = true; current = n; title.Text = n == null ? "새로운 생각을 담아보세요" : n.Title;
            var doc = Document(n == null ? "위쪽의 ‘＋’를 눌러 메모를 시작하세요." : n.Body);
            if (n != null && !String.IsNullOrEmpty(n.Body) && !String.IsNullOrEmpty(n.BodyRtf)) {
                try { using (var stream = new MemoryStream(Convert.FromBase64String(n.BodyRtf))) new TextRange(doc.ContentStart,doc.ContentEnd).Load(stream,DataFormats.Rtf); }
                catch (Exception) { doc = Document(n.Body); }
            }
            editor.Document = doc; editor.IsEnabled = title.IsEnabled = fontSizePicker.IsEnabled = boldButton.IsEnabled = n != null;
            if (n != null && String.IsNullOrEmpty(n.Body)) {
                editor.Document.FontSize = n.EmptyFontSize >= 8 ? n.EmptyFontSize : DefaultTextSize;
                editor.Document.FontWeight = n.EmptyBold ? FontWeights.Bold : FontWeights.Normal;
                editor.Selection.ApplyPropertyValue(TextElement.FontSizeProperty,n.EmptyFontSize >= 8 ? n.EmptyFontSize : DefaultTextSize);
                editor.Selection.ApplyPropertyValue(TextElement.FontWeightProperty,n.EmptyBold ? FontWeights.Bold : FontWeights.Normal);
            }
            count.Text = n == null ? "" : (n.Body ?? "").Length.ToString("N0") + "자";
            paper.Offset = 0; NormalizeLines(); loading = false; SyncFormat(); RefreshNotes();
            if (n != null && book.LastNote != n.Id) { book.LastNote = n.Id; Changed(); }
        }
        void NewNote() {
            CompleteComposition();
            Capture(); var n = new Note { Id = Guid.NewGuid().ToString("N"), FolderId = book.Folders[0].Id, Title = "새 메모", Body = "", Updated = DateTime.Now, CreationOrder = NoteView.NextOrder(book) }; book.Notes.Add(n); search.Text = ""; ShowNote(n); Changed(); title.Focus(); title.SelectAll();
        }
        void DeleteNote() {
            if (current == null || MessageBox.Show(this,"‘" + NoteTitle(current) + "’ 메모를 삭제할까요?\n삭제한 메모는 앱에서 되돌릴 수 없습니다.","메모 삭제",MessageBoxButton.OKCancel,MessageBoxImage.Question) != MessageBoxResult.OK) return;
            book.Notes.Remove(current); ShowNote(NoteView.Sorted(book).FirstOrDefault()); Changed();
        }
        void ToggleCompact() {
            if (folded) ToggleFold();
            adjusting = true;
            compact = !compact; if (compact) {
                wideWidth = Width; wideHeight = Height; notesPanel.Visibility = Visibility.Collapsed; notesColumn.Width = new GridLength(0);
                MinWidth = 320; MinHeight = 300; Width = widgetWidth; Height = widgetHeight; compactButton.Content = "목록";
                if (book.HasWidgetPosition) { Left = book.WidgetLeft; Top = book.WidgetTop; }
            } else {
                widgetWidth = Width; widgetHeight = Height; MinWidth = 640; MinHeight = 440; Width = wideWidth; Height = wideHeight;
                notesPanel.Visibility = Visibility.Visible; notesColumn.Width = new GridLength(245); compactButton.Content = "메모로";
            }
            if (ready) KeepOnScreen(); adjusting = false; RememberWidget();
        }
        void AddMenu(ContextMenu menu, string text, Action action) { var item = new MenuItem { Header = text }; item.Click += delegate { action(); }; menu.Items.Add(item); }
        void ToggleFold() {
            if (!compact) ToggleCompact();
            adjusting = true;
            if (!folded) { widgetHeight = Height; widgetWidth = Width; root.Visibility = Visibility.Collapsed; MinHeight = HeaderHeight; Height = HeaderHeight+2; ResizeMode = ResizeMode.NoResize; folded = true; }
            else { folded = false; root.Visibility = Visibility.Visible; MinHeight = 300; Height = widgetHeight; ResizeMode = ResizeMode.CanResize; }
            KeepOnScreen(); adjusting = false; RememberWidget();
        }
        public void RequestExit() { Capture(); if (!Save(true)) return; exitRequested = true; Close(); }
        void BringNote() { if (folded) ToggleFold(); Show(); WindowState = WindowState.Normal; KeepOnScreen(); Activate(); }
        void OnSessionEnding(object sender, SessionEndingCancelEventArgs e) { sessionEnding = true; exitRequested = true; Capture(); Save(false); }
        void OnDesktopChanged(object sender, System.ComponentModel.PropertyChangedEventArgs e) { if (ready && !exitRequested) Dispatcher.BeginInvoke(new Action(KeepOnScreen)); }
        IntPtr WindowMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
            // Treat the widget as a tool window, and restore it after a shell minimize.
            if (msg == 0x007E) Dispatcher.BeginInvoke(new Action(KeepOnScreen));
            if (msg == 0x0084 && !folded && WindowState == WindowState.Normal) {
                long value = lParam.ToInt64(); var point = PointFromScreen(new Point((short)(value & 0xffff),(short)((value >> 16) & 0xffff)));
                var surface = (FrameworkElement)Content;
                bool left = point.X < 5, right = point.X >= surface.ActualWidth-5, top = point.Y < 5, bottom = point.Y >= surface.ActualHeight-5;
                int edge = top ? (left ? 13 : right ? 14 : 12) : bottom ? (left ? 16 : right ? 17 : 15) : left ? 10 : right ? 11 : 0;
                if (edge != 0) { handled = true; return new IntPtr(edge); }
            }
            return IntPtr.Zero;
        }
        Rect WorkArea() {
            var source = PresentationSource.FromVisual(this);
            if (source == null || source.CompositionTarget == null) return SystemParameters.WorkArea;
            var toDevice = source.CompositionTarget.TransformToDevice;
            var center = toDevice.Transform(new Point(Double.IsNaN(Left) ? 0 : Left + Width/2, Double.IsNaN(Top) ? 0 : Top + Height/2));
            var screen = Forms.Screen.FromPoint(new System.Drawing.Point((int)center.X,(int)center.Y)).WorkingArea;
            var fromDevice = source.CompositionTarget.TransformFromDevice;
            return new Rect(fromDevice.Transform(new Point(screen.Left,screen.Top)),fromDevice.Transform(new Point(screen.Right,screen.Bottom)));
        }
        void KeepOnScreen() {
            var area = WorkArea(); bool was = adjusting; adjusting = true;
            if (Width > area.Width) { MinWidth = Math.Min(MinWidth,area.Width); Width = area.Width; }
            if (Height > area.Height) { MinHeight = Math.Min(MinHeight,area.Height); Height = area.Height; }
            Left = Math.Max(area.Left,Math.Min(Double.IsNaN(Left) ? area.Left : Left,area.Right-Width));
            Top = Math.Max(area.Top,Math.Min(Double.IsNaN(Top) ? area.Top : Top,area.Bottom-Height));
            adjusting = was; RememberWidget();
        }
        void DockCorner() { if (!compact) ToggleCompact(); var area = WorkArea(); Left = area.Right-Width-18; Top = area.Bottom-Height-18; KeepOnScreen(); RememberWidget(); }
        void RememberWidget() {
            if (!ready || adjusting || !compact || WindowState != WindowState.Normal) return;
            if (!folded) { widgetWidth = Width; widgetHeight = Height; }
            if (book.HasWidgetPosition && book.WidgetLeft == Left && book.WidgetTop == Top && book.WidgetWidth == widgetWidth && book.WidgetHeight == widgetHeight) return;
            book.HasWidgetPosition = true; book.WidgetLeft = Left; book.WidgetTop = Top; book.WidgetWidth = widgetWidth; book.WidgetHeight = widgetHeight; Changed();
        }
        void SetupTray() {
            tray = new Forms.NotifyIcon { Text = "한 장 · 바탕화면 메모", Icon = System.Drawing.SystemIcons.Information };
            var menu = new Forms.ContextMenuStrip();
            menu.Items.Add("메모 펼치기",null,delegate { Dispatcher.BeginInvoke(new Action(BringNote)); });
            menu.Items.Add("메모 목록",null,delegate { Dispatcher.BeginInvoke(new Action(delegate { BringNote(); if (compact) ToggleCompact(); })); });
            menu.Items.Add("새 메모",null,delegate { Dispatcher.BeginInvoke(new Action(delegate { BringNote(); NewNote(); })); });
            menu.Items.Add(new Forms.ToolStripSeparator());
            menu.Items.Add("앱 종료",null,delegate { Dispatcher.BeginInvoke(new Action(RequestExit)); });
            tray.ContextMenuStrip = menu; tray.DoubleClick += delegate { Dispatcher.BeginInvoke(new Action(BringNote)); }; tray.Visible = true;
        }
        void Keys(object sender, KeyEventArgs e) {
            if ((Keyboard.Modifiers & ModifierKeys.Control) == 0) return;
            if (e.Key == Key.B && editor.IsKeyboardFocusWithin) { ApplyBold(boldButton.IsChecked != true); e.Handled = true; }
            else if (e.Key == Key.S) { Capture(); Save(true); e.Handled = true; }
            else if (e.Key == Key.N && (Keyboard.Modifiers & ModifierKeys.Shift) == 0) { NewNote(); e.Handled = true; }
            else if (e.Key == Key.F) { if (compact) ToggleCompact(); search.Focus(); e.Handled = true; }
        }
        public void SmokeTest(string output) {
            SettleLayout();
            if (!compact || Topmost || ShowInTaskbar || WindowStyle != WindowStyle.None || tray == null || !tray.Visible) throw new Exception("Widget startup failed");
            var handle = new WindowInteropHelper(this).Handle;
            if ((GetWindowLong(handle,-20) & 0x80) == 0) throw new Exception("Tool window style failed");
            BringNote(); SettleLayout();
            if (book.Pinned || Topmost || (GetWindowLong(handle,-20) & 8) != 0) throw new Exception("Legacy topmost preference must be disabled");
            double originalHeight = Height;
            ToggleFold(); if (!folded || Math.Abs(Height-HeaderHeight-2)>1 || root.Visibility != Visibility.Collapsed) throw new Exception("Fold failed");
            ToggleFold(); if (folded || Math.Abs(Height-originalHeight)>1) throw new Exception("Unfold failed");
            Close(); if (!IsVisible || !folded || exitRequested) throw new Exception("Close should retain the widget");
            BringNote();
            Left = -50000; Top = -50000; KeepOnScreen();
            if (!WorkArea().Contains(new Rect(Left,Top,Width,Height))) throw new Exception("Offscreen recovery failed");
            DockCorner(); RememberWidget(); Save(true);
            var geometry = store.Load(); if (!geometry.HasWidgetPosition || geometry.WidgetLeft != Left || geometry.WidgetTop != Top || geometry.Pinned) throw new Exception("Widget settings persistence failed");
            ToggleCompact(); if (compact || notesPanel.Visibility != Visibility.Visible || root.ColumnDefinitions.Count != 2) throw new Exception("Note list expansion failed");
            TestSortingAndSearch();
            TestDeferredInput();
            NewNote(); title.Text = "한글 입력 저장 검사"; editor.Document = Document("첫 번째 줄\n두 번째 줄\n\n마지막 줄"); Capture();
            if (current.Body != "첫 번째 줄\n두 번째 줄\n\n마지막 줄") throw new Exception("Line break roundtrip failed: " + current.Body);
            string id = current.Id; Save(true); if (store.Load().Notes.First(n => n.Id == id).Body != current.Body) throw new Exception("Editor persistence failed");
            if (!book.Folders.Any(f => f.Id == "legacy-work")) book.Folders.Add(new Folder { Id = "legacy-work", Name = "이전 업무 분류" });
            var legacyNote = new Note { Id = "legacy-note", FolderId = "legacy-work", Title = title.Text, Body = "예전 메모 내용 보존", Updated = DateTime.Now, CreationOrder = NoteView.NextOrder(book) };
            book.Notes.Add(legacyNote); RefreshNotes();
            if (notePicker.Items.Count != book.Notes.Count || notes.Items.Count != book.Notes.Count) throw new Exception("All legacy notes must be listed");
            search.Text = "예전 메모 내용";
            if (notes.Items.Count != 1 || (string)((ListBoxItem)notes.Items[0]).Tag != legacyNote.Id) throw new Exception("Global search failed");
            search.Text = "";
            notePicker.SelectedItem = notePicker.Items.Cast<NoteChoice>().First(n => n.Id == legacyNote.Id);
            if (current.Id != legacyNote.Id || Body() != "예전 메모 내용 보존") throw new Exception("Legacy note selection failed");
            Capture(); Save(true);
            var allSaved = store.Load();
            if (allSaved.Notes.Count != book.Notes.Count || allSaved.Notes.First(n => n.Id == legacyNote.Id).Body != legacyNote.Body) throw new Exception("Legacy note preservation failed");
            notePicker.SelectedItem = notePicker.Items.Cast<NoteChoice>().First(n => n.Id == book.Notes[0].Id);
            if (current.Id != book.Notes[0].Id) throw new Exception("Note picker failed");
            notePicker.SelectedItem = notePicker.Items.Cast<NoteChoice>().First(n => n.Id == id);
            if (current.Id != id) throw new Exception("Note picker selection failed");
            var formatStart = editor.Document.ContentStart.GetNextInsertionPosition(LogicalDirection.Forward);
            editor.Selection.Select(formatStart,formatStart.GetPositionAtOffset(3));
            fontSizePicker.Focus(); fontSizePicker.SelectedItem = 14.0; ApplyBold(true); string formattedBody = Body(); Capture(); Save(true);
            var savedNote = store.Load().Notes.First(n => n.Id == id);
            if (String.IsNullOrEmpty(savedNote.BodyRtf) || savedNote.Body != formattedBody) throw new Exception("Rich text persistence failed");
            book.Notes[book.Notes.FindIndex(n => n.Id == id)] = savedNote; ShowNote(book.Notes[0]); ShowNote(savedNote);
            formatStart = editor.Document.ContentStart.GetNextInsertionPosition(LogicalDirection.Forward);
            var formatted = new TextRange(formatStart,formatStart.GetPositionAtOffset(3));
            if (Math.Abs((double)formatted.GetPropertyValue(TextElement.FontSizeProperty)-14*4.0/3.0)>0.1 || (FontWeight)formatted.GetPropertyValue(TextElement.FontWeightProperty) != FontWeights.Bold) throw new Exception("Selected formatting reload failed");
            var untouchedPosition = editor.Document.ContentEnd.GetNextInsertionPosition(LogicalDirection.Backward).GetNextInsertionPosition(LogicalDirection.Backward);
            var untouched = new TextRange(untouchedPosition,untouchedPosition);
            if (Math.Abs((double)untouched.GetPropertyValue(TextElement.FontSizeProperty)-DefaultTextSize)>0.1 || (FontWeight)untouched.GetPropertyValue(TextElement.FontWeightProperty) == FontWeights.Bold) throw new Exception("Formatting leaked outside selection");
            editor.Selection.Select(formatStart,formatStart.GetPositionAtOffset(3)); ApplyBold(false);
            if ((FontWeight)editor.Selection.GetPropertyValue(TextElement.FontWeightProperty) != FontWeights.Normal) throw new Exception("Unbold failed");
            editor.Undo();
            if ((FontWeight)editor.Selection.GetPropertyValue(TextElement.FontWeightProperty) != FontWeights.Bold) throw new Exception("Format undo failed");
            ApplyTextSize(20); editor.Undo();
            if (Math.Abs((double)editor.Selection.GetPropertyValue(TextElement.FontSizeProperty)-14*4.0/3.0)>0.1) throw new Exception("Font size undo failed");
            editor.Focus(); editor.CaretPosition = editor.Document.ContentEnd; EditingCommands.EnterParagraphBreak.Execute(null,editor); editor.CaretPosition.InsertTextInRun("Enter 입력 검사"); Capture();
            if (!current.Body.EndsWith("\nEnter 입력 검사")) throw new Exception("Enter failed");
            editor.Document = Document(String.Join("\n",Enumerable.Range(1,60).Select(i => "한글 줄바꿈과 스크롤 확인 " + i))); NormalizeLines();
            editor.UpdateLayout(); var first = editor.Document.ContentStart.GetNextInsertionPosition(LogicalDirection.Forward); var second = first.GetLineStartPosition(1);
            if (paper.Spacing != 22 || Math.Abs(second.GetCharacterRect(LogicalDirection.Forward).Top - first.GetCharacterRect(LogicalDirection.Forward).Top - 22) > 1) throw new Exception("Dense line height mismatch");
            editor.ScrollToVerticalOffset(115); editor.UpdateLayout();
            if (editor.VerticalOffset < 100 || Math.Abs(paper.Offset-editor.VerticalOffset) > 1) throw new Exception("Paper scroll mismatch");
            string longLine = String.Concat(Enumerable.Repeat("긴 문장 자동 줄바꿈 검사 ",20)); editor.Document = Document(longLine); NormalizeLines(); editor.UpdateLayout();
            first = editor.Document.ContentStart.GetNextInsertionPosition(LogicalDirection.Forward); second = first.GetLineStartPosition(1);
            if (second == null || Math.Abs(second.GetCharacterRect(LogicalDirection.Forward).Top - first.GetCharacterRect(LogicalDirection.Forward).Top - 22) > 1 || Body() != longLine) throw new Exception("Wrapped line alignment failed");
            editor.SelectAll(); ApplyTextSize(32); editor.UpdateLayout();
            first = editor.Document.ContentStart.GetNextInsertionPosition(LogicalDirection.Forward); second = first.GetLineStartPosition(1);
            if (paper.Spacing < 68 || second == null || Math.Abs(second.GetCharacterRect(LogicalDirection.Forward).Top-first.GetCharacterRect(LogicalDirection.Forward).Top-paper.Spacing)>1) throw new Exception("Large font grid alignment failed");
            NewNote(); string emptyId = current.Id; ApplyTextSize(9); ApplyBold(true); Capture(); Save(true);
            var emptySaved = store.Load().Notes.First(n => n.Id == emptyId);
            book.Notes[book.Notes.FindIndex(n => n.Id == emptyId)] = emptySaved; ShowNote(book.Notes[0]); ShowNote(emptySaved);
            if (Math.Abs((double)editor.Selection.GetPropertyValue(TextElement.FontSizeProperty)-12)>0.1 || (FontWeight)editor.Selection.GetPropertyValue(TextElement.FontWeightProperty) != FontWeights.Bold) throw new Exception("Empty note insertion format persistence failed");
            editor.Focus(); editor.Selection.Text = "새로운 한글 입력"; Capture();
            if (Body() != "새로운 한글 입력") throw new Exception("Formatted text insertion failed");
            editor.SelectAll();
            if (Math.Abs((double)editor.Selection.GetPropertyValue(TextElement.FontSizeProperty)-12)>0.1 || (FontWeight)editor.Selection.GetPropertyValue(TextElement.FontWeightProperty) != FontWeights.Bold) throw new Exception("Typing failed to inherit formatting");
            book.Notes.RemoveAll(n => n.Id == emptyId || n.Id == legacyNote.Id);
            ToggleCompact(); if (Width != widgetWidth || !compact) throw new Exception("Compact failed");
            ShowNote(book.Notes[0]); UpdateLayout(); Render(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(output),"compact-preview.png")); ToggleCompact();
            book.Notes.RemoveAll(n => n.Id == id); RefreshNotes(); Changed(); Save(true); UpdateLayout();
            Render(output);
        }
        string[] ListedIds() { return notes.Items.Cast<ListBoxItem>().Where(i => i.IsEnabled).Select(i => (string)i.Tag).ToArray(); }
        void TestDeferredInput() {
            Note original = current; NewNote(); Note test = current;
            editor.Document = Document(new string('가',100000)); Capture();
            int before = richExports;
            var timer = System.Diagnostics.Stopwatch.StartNew();
            for (int i=0; i<100; i++) editor.AppendText("를");
            timer.Stop();
            if (richExports != before || !editPending) throw new Exception("Typing must not serialize the document synchronously");
            // Simulate composition ownership across an autosave deadline, including title input.
            composition = new TextComposition(InputManager.Current,editor,"");
            editor.AppendText("받침 있는 한글을 입력합니다");
            title.Text = "한글 제목"; Capture(); SaveInBackground();
            if (richExports != before || saveTask != null || current.Title == title.Text) throw new Exception("Composition must defer capture and autosave");
            composition = null; Capture();
            if (richExports != before+1 || !current.Body.EndsWith("받침 있는 한글을 입력합니다") || current.Title != "한글 제목") throw new Exception("Committed input was not captured exactly once");
            SaveInBackground();
            editor.AppendText(" 종료 직전 수정"); Save(true);
            if (store.Load().Notes.First(n => n.Id == test.Id).Body != Body()) throw new Exception("Latest edit lost while background save was pending");
            File.WriteAllText(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(store.PathName),"input-test.txt"),"PASS: 100 edits to 100,000-character document without per-key RTF export (" + timer.ElapsedMilliseconds + " ms); IME capture/save deferral; committed text; background save followed by immediate exit flush");
            ShowNote(original); book.Notes.Remove(test); RefreshNotes(); Changed(); Save(true);
        }
        void AssertResults(params string[] ids) {
            if (!ListedIds().OrderBy(x => x).SequenceEqual(ids.OrderBy(x => x))) throw new Exception("Search results differ: " + search.Text);
        }
        void TestSortingAndSearch() {
            Note original = current; sortPicker.SelectedIndex = 0;
            NewNote(); Note older = current; title.Text = "제목전용회의";
            editor.Document = Document("본문전용토큰 AlphaBeta 공통내용 " + new string('가',250)); Capture();
            NewNote(); Note newer = current; title.Text = "두번째 메모"; editor.Document = Document("짧음"); Capture();
            long olderOrder = older.CreationOrder, newerOrder = newer.CreationOrder;
            if (newerOrder <= olderOrder || ListedIds()[0] != newer.Id) throw new Exception("New note must be first in creation order");
            ShowNote(older); title.Text += " 수정"; editor.AppendText(" 수정된 본문"); Capture(); RefreshNotes();
            if (older.CreationOrder != olderOrder || ListedIds()[0] != newer.Id || ((NoteChoice)notePicker.Items[0]).Id != newer.Id) throw new Exception("Editing changed creation order");
            sortPicker.SelectedIndex = 1;
            if (ListedIds()[0] != older.Id || current.Id != older.Id) throw new Exception("Size sorting or selection preservation failed");
            ShowNote(newer); editor.Document = Document("공통내용 " + new string('나',700)); Capture();
            if (ListedIds()[0] != newer.Id || ((NoteChoice)notePicker.Items[0]).Id != newer.Id) throw new Exception("Size sort did not update after editing");
            search.Text = "제목전용"; AssertResults(older.Id);
            search.Text = "전용토"; AssertResults(older.Id);
            search.Text = "공통내용"; AssertResults(older.Id,newer.Id);
            search.Text = "alphabeta"; AssertResults(older.Id);
            search.Text = "검색결과없는고유문구"; AssertResults();
            search.Text = "   "; if (ListedIds().Length != book.Notes.Count) throw new Exception("Blank search failed");
            search.Text = "";
            Capture(); Save(true); var loaded = store.Load();
            if (loaded.SortMode != "size" || loaded.Notes.First(n => n.Id == older.Id).CreationOrder != olderOrder || NoteView.Sorted(loaded).First().Id != newer.Id) throw new Exception("Sorting persistence failed");
            ShowNote(older); editor.Document = Document(newer.Body); Capture();
            if (ListedIds()[0] != newer.Id) throw new Exception("Size tie must prefer newer creation");
            sortPicker.SelectedIndex = 0;
            if (ListedIds()[0] != newer.Id || older.CreationOrder != olderOrder) throw new Exception("Creation order changed after size sorting");
            Capture(); ShowNote(original); book.Notes.RemoveAll(n => n.Id == older.Id || n.Id == newer.Id); RefreshNotes(); Changed(); Save(true);
        }
        void Render(string output) {
            SettleLayout();
            var surface = (FrameworkElement)Content;
            // Explicitly arrange the content for deterministic snapshots after native resizing.
            surface.Measure(new Size(Width,Height)); surface.Arrange(new Rect(0,0,Width,Height)); surface.UpdateLayout();
            var bmp = new RenderTargetBitmap((int)surface.ActualWidth,(int)surface.ActualHeight,96,96,PixelFormats.Pbgra32); bmp.Render(surface);
            using (var s = File.Create(output)) { var enc = new PngBitmapEncoder(); enc.Frames.Add(BitmapFrame.Create(bmp)); enc.Save(s); }
        }
        void SettleLayout() {
            var frame = new DispatcherFrame(); Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle,new Action(delegate { frame.Continue = false; })); Dispatcher.PushFrame(frame); UpdateLayout();
        }
    }
    public static class Program {
        public static Notebook Fresh() {
            var b = new Notebook(); b.Folders.Add(new Folder { Id = "inbox", Name = "기본 메모" });
            b.Notes.Add(new Note { Id = Guid.NewGuid().ToString("N"), FolderId = "inbox", Title = "오늘의 작은 메모", Body = "잊고 싶지 않은 생각을 적어보세요.\nEnter를 누르면 다음 줄로 이어집니다.\n\n‘목록’에서 정렬 방식을 고를 수 있어요.\n작성 순은 수정해도 자리가 유지됩니다.\n크기 순은 본문이 긴 메모부터 보여줘요.\n\n검색은 제목과 본문을 함께 찾습니다.\n쓴 내용과 서식은 이 PC에 저장됩니다.", Updated = DateTime.Now, CreationOrder = 1 }); return b;
        }
        [STAThread] public static int Main(string[] args) {
            try {
                if (args.Length > 0 && args[0] == "--self-test") { SelfTest(args[1]); return 0; }
                string path = NotebookLocation.UserPath(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
                bool smoke = args.Length > 0 && args[0] == "--smoke-test";
                bool inputTest = args.Length > 0 && args[0] == "--input-test";
                if (smoke || inputTest) path = System.IO.Path.Combine(args[1],"ui-notes.json");
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
                // Exclusive lifetime lock prevents two windows overwriting the same notebook.
                using (var session = new FileStream(path + ".lock",FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
                    if (!smoke && !inputTest) NotebookLocation.ImportLegacy(path,AppDomain.CurrentDomain.BaseDirectory);
                    var store = new Store(path); Notebook book;
                    if (File.Exists(path) || File.Exists(path + ".bak")) {
                        try { book = store.Load(); }
                        catch (Exception) {
                            if (!File.Exists(path + ".bak")) throw;
                            book = new Store(path + ".bak").Load();
                            if (File.Exists(path)) File.Copy(path,path + ".damaged-" + DateTime.Now.ToString("yyyyMMdd-HHmmssfff"),false);
                            File.Copy(path + ".bak",path,true);
                            MessageBox.Show("저장 파일을 읽을 수 없어 이전 백업을 복구했습니다. 손상된 파일도 data 폴더에 보관했습니다.","메모 복구");
                        }
                    } else {
                        book = Fresh();
                        store.Save(book);
                    }
                    if (smoke) book.Pinned = true;
                    var app = new Application(); var win = new MemoWindow(store,book);
                    if (inputTest) win.Loaded += delegate { win.ShowInTaskbar = true; win.Title = "한 장 · 입력 검사"; };
                    if (smoke) win.Loaded += delegate { win.Dispatcher.BeginInvoke(new Action(delegate { try { win.SmokeTest(System.IO.Path.Combine(args[1],"preview.png")); File.WriteAllText(System.IO.Path.Combine(args[1],"ui-test.txt"),"PASS: fixed creation ordering despite edits, descending body size and ties, sorting persistence, title/body/substring/case-insensitive/multiple/no-result/blank search, legacy topmost disabled, legacy notes preserved, formatting and widget regression checks"); } catch(Exception ex) { File.WriteAllText(System.IO.Path.Combine(args[1],"ui-test.txt"),ex.ToString()); Environment.ExitCode = 1; } finally { win.RequestExit(); } }),DispatcherPriority.ApplicationIdle); };
                    app.Run(win); return Environment.ExitCode;
                }
            } catch (IOException ex) { MessageBox.Show("메모 파일을 열지 못했습니다. 이미 실행 중이라면 기존 창을 사용해 주세요.\n\n" + ex.Message,"한 장"); return 1; }
            catch (Exception ex) { MessageBox.Show("앱을 시작하지 못했습니다. 기존 메모 파일은 유지됩니다.\n\n" + ex.Message,"한 장"); return 1; }
        }
        static void SelfTest(string dir) {
            TestRelocation(dir);
            Directory.CreateDirectory(dir); var store = new Store(System.IO.Path.Combine(dir,"test-notes.json")); var b = Fresh();
            var olderLegacy = new Note { Id = "legacy-older", FolderId = "inbox", Body = "보존", Title = "이전 메모", Updated = DateTime.Now.AddDays(-1) };
            b.Notes[0].CreationOrder = 0; b.Notes.Add(olderLegacy); NoteView.Initialize(b);
            string[] frozenOrder = NoteView.Sorted(b).Select(n => n.Id).ToArray(); olderLegacy.Updated = DateTime.Now.AddDays(1);
            NoteView.Initialize(b); if (!NoteView.Sorted(b).Select(n => n.Id).SequenceEqual(frozenOrder)) throw new Exception("Legacy order migration was not stable");
            b.Folders.Add(new Folder { Id = "work", Name = "업무 / 아이디어" }); b.Notes[0].Body = "가나다\n다음 줄\n\nemoji 😀 & < >"; b.Notes[0].FolderId = "work"; store.Save(b);
            var loaded = store.Load(); if (loaded.Notes[0].Body != b.Notes[0].Body || loaded.Notes[0].FolderId != "work") throw new Exception("Roundtrip failed");
            loaded.Notes[0].Title = "수정"; store.Save(loaded); if (!File.Exists(store.PathName + ".bak") || store.Load().Notes[0].Title != "수정") throw new Exception("Atomic save failed");
            if (new Store(store.PathName + ".bak").Load().Notes[0].Title != b.Notes[0].Title) throw new Exception("Backup failed");
            loaded.Notes[0].FolderId = "missing"; bool rejected = false; try { store.Save(loaded); } catch(InvalidDataException) { rejected = true; } if (!rejected || store.Load().Notes[0].FolderId != "work") throw new Exception("Validation failed");
            File.WriteAllText(System.IO.Path.Combine(dir,"storage-test.txt"),"PASS: Unicode and multiline roundtrip, folder association, atomic replacement, backup, invalid-data protection");
        }
        static void TestRelocation(string dir) {
            string root = System.IO.Path.Combine(dir,"relocation-" + Guid.NewGuid().ToString("N"));
            string original = System.IO.Path.Combine(root,"original"), moved = System.IO.Path.Combine(root,"moved");
            string source = System.IO.Path.Combine(original,"data","widget-notes.json");
            string target = NotebookLocation.UserPath(System.IO.Path.Combine(root,"profile"));
            var b = Fresh(); b.Notes[0].Title = "이전 메모"; b.Notes[0].BodyRtf = "preserve-exactly"; new Store(source).Save(b);
            NotebookLocation.ImportLegacy(target,original);
            if (!File.ReadAllBytes(source).SequenceEqual(File.ReadAllBytes(target))) throw new Exception("Migration must preserve every byte");
            // Moving only the executable means the new directory has no data at all.
            Directory.CreateDirectory(moved); NotebookLocation.ImportLegacy(target,moved);
            if (new Store(target).Load().Notes[0].Title != "이전 메모") throw new Exception("Executable relocation lost notebook");
            var updated = new Store(target).Load(); updated.Notes[0].Title = "고정 경로의 최신 메모"; new Store(target).Save(updated);
            NotebookLocation.ImportLegacy(target,original);
            if (new Store(target).Load().Notes[0].Title != updated.Notes[0].Title) throw new Exception("Stale local data overwrote current notebook");
            string backupTarget = NotebookLocation.UserPath(System.IO.Path.Combine(root,"backup-profile"));
            File.Copy(source,source+".bak"); File.WriteAllText(source,"broken"); NotebookLocation.ImportLegacy(backupTarget,original);
            if (new Store(backupTarget).Load().Notes[0].Title != "이전 메모") throw new Exception("Legacy backup import failed");
            string lockedTarget = NotebookLocation.UserPath(System.IO.Path.Combine(root,"locked-profile"));
            using (var guard = new FileStream(source+".lock",FileMode.Open,FileAccess.ReadWrite,FileShare.None)) {
                bool blocked=false; try { NotebookLocation.ImportLegacy(lockedTarget,original); } catch(IOException) { blocked=true; }
                if (!blocked || File.Exists(lockedTarget)) throw new Exception("Migration must not copy an active legacy notebook");
            }
            File.WriteAllText(System.IO.Path.Combine(dir,"relocation-test.txt"),"PASS: byte-exact legacy import, executable-only relocation, existing notebook priority, backup recovery, active legacy lock");
        }
    }
}
