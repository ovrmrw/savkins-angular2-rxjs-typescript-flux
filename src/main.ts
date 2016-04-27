import {bootstrap} from 'angular2/platform/browser';
import {Component, bind, Input, Output, EventEmitter, enableProdMode, ChangeDetectionStrategy} from 'angular2/core';
import {Observable} from 'rxjs/Observable';
import {Observer} from 'rxjs/Observer';
import {Subject} from 'rxjs/Subject';
import {BehaviorSubject} from 'rxjs/subject/BehaviorSubject';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/do';
import 'rxjs/add/observable/zip';


////////////////////////////////////////////////////////////////////////////////////
// -- state
/* 
  Stateを管理するのためのインターフェース。
  Component側でもContainer側でもTypeScriptの静的型チェックの恩恵を全面的に受けられるのがSavkin's Fluxの特徴です。
*/
interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface AppState {
  todos: Todo[];
  visibilityFilter: string;
}


////////////////////////////////////////////////////////////////////////////////////
// -- actions
/* 
  Fluxの要、アクション。
  文字列ではなくクラスの型で定義するのがSavkin流。ここでもTypeScriptの静的型チェックの恩恵を受けられます。
*/
class AddTodoAction {
  constructor(public todoId: number, public text: string) { }
}
class ToggleTodoAction {
  constructor(public id: number) { }
}
class SetVisibilityFilter {
  constructor(public filter: string) { }
}

// これら2つはContainerのconstructorのヘルパー関数内で使われます。必要なものだけを見せるという配慮。
type ActionTypeTodo = AddTodoAction | ToggleTodoAction; // Todoに関するアクションを束ねたもの。
type ActionTypeFilter = SetVisibilityFilter; // Filterに関するアクションを束ねたもの。

// これはあらゆる場所で使われます。TypeScriptの真髄と言えるでしょう。
type Action = ActionTypeTodo | ActionTypeFilter; // 全てのアクションを束ねたもの。


////////////////////////////////////////////////////////////////////////////////////
// -- statefn
/*  
  Stateを管理をするクラス。Componentの対を成してデータを一方通行で流します。  
  オリジナルのstateFnがfunctionだったので全面的にclassで書き直しています。ついでに名前をContainerとしました。
  classにすることで見通しが良くなり、扱いも簡単になります。特にComponentでDIするときに@Inject()が不要になります。
  このクラスを理解するとRxJSの応用的な使い方がわかるようになります。
*/
// @Injectable() // Injectableはインスタンス生成をInjectorに任せる場合に必須です。このサンプルではtoFactoryで生成するので不要。(@laco0416 さんありがとう！)
class Container {
  private stateSubject: Subject<AppState>; // .next出来ればいいだけなのでBehaviorSubjectではなくSubjectで可です。

  constructor(initState: AppState, dispatcher$: Observable<Action>) { // dispatcherの型はDispatcher<Action>でも良いのですが敢えてそうする必要もないのでObservableにしてます。
    // BehaviorSubjectを使ってStateの初期値をセットします。これが案外重要です。
    this.stateSubject = new BehaviorSubject(initState); // ここはBehaviorSubjectかReplaySubjectを使わないと動作しませんでした。Subjectではダメでした。

    // Component側で"dispatcher$.next()"するとここにストリームが流れてきます。
    // 最後はここからComponentにストリームを流すのですが、驚くべき事に一連の流れが全てRxJSのストリームです。
    // 理解するのは大変ですがこの一文の威力は凄まじいものがあります。        
    Observable
      .zip<AppState>( // "rxjs zip"でググる。
        // 2つあるReducerは実際にはObservable.scanです。Component側の"dispatcher$.next()"でストリームを流すと、これらのscanがストリームを受けます。
        // 内包する全てのObservableのストリームを受けるまでzipは次にストリームを流しません。        
        todosStateReducer(initState.todos, dispatcher$), // 勘違いしてはいけません。これは"初回に一度だけ"実行される関数です。
        filterStateReducer(initState.visibilityFilter, dispatcher$), //  〃
        (todos, visibilityFilter) => { // zipが返す値を整形できます。
          return { todos, visibilityFilter } as AppState; // {'todos':todos,'visibilityFilter':visibilityFilter}の省略記法です。
        }
      )
      // .do(s => console.log(s)) // 別にこれは要りません。ストリームの中間で値がどうなっているか確認したいときに使います。
      .subscribe(appState => { // "rxjs subscribe"でググる。
        // .nextでストリームを次に流しています。次ってどこ？Component側の"state$.map(...)"の部分です。これが腑に落ちると結構感動します。
        this.stateSubject.next(appState);
      });
  }
  
  // このプロパティはComponentとContainerを繋ぐブリッジだと言えます。privateなプロパティを渡すことでリードオンリーにしているのも特徴です。
  // Component側では"state$.map(...)"の部分でストリームを受けています。
  get state$() {
    return this.stateSubject as Observable<AppState>; // Component側で参照したときに見慣れたObservableになっているという親切設計。
  }
}

/*
  ContainerのconstructorのReducer群。
  変更の必要があるものだけ値を差し替えて返します。
  Actionの型に応じて処理が分岐していくのが特徴で、TypeScriptの型判定が使われています。
  
  Componentで"dispatcher$.next(hoge)"するとscanにhogeが投げ込まれて新しい値を返します。
  返すってどこに？Reducerを内包しているObservable.zipに、です。
  値を返すというよりストリームを次に流すと言った方がRxJS的かもしれません。
  重要なのは配列やコレクションのreduceと違って、Observable.scanは一度セットされるとずっと"残り続ける"ことにあります。(@bouzuya さんありがとう！)
  何分でも何時間でもアプリケーションが終了するまで残り続けてdispatcher$からのnextを待ち続けます。なんて健気なんでしょう。     
*/
// dispatcher$の型がObservable<Action>ではなく<ActionTypeTodo>なのは、Todoの操作に必要なものだけ見せるという配慮です。
function todosStateReducer(initTodos: Todo[], dispatcher$: Observable<ActionTypeTodo>): Observable<Todo[]> {
  // Observable.scanは一度セットされると時間をまたいでreduceします。アプリケーション開始から終了まで続く大きな流れの中でのreduceです。
  return dispatcher$.scan<Todo[]>((todos: Todo[], action: ActionTypeTodo) => { // "rxjs scan"でググる。
    if (action instanceof AddTodoAction) { // actionがAddTodoActionの場合。
      const newTodo = {
        id: action.todoId,
        text: action.text,
        completed: false
      } as Todo; // TypeScriptの静的型チェックの恩恵を受けています。
      return [...todos, newTodo]; // ...todosは配列を展開しています。todos.concat(newTodo)と同等です。
    } else if (action instanceof ToggleTodoAction) { // actionがToggleTodoActionの場合。
      return todos.map(todo => {
        return (action.id !== todo.id) ? todo : merge(todo, { completed: !todo.completed });
      });
    } else { // actionがAddTodoActionでもToggleTodoActionでもない場合。
      return todos; // 引数の値をそのまま返す。
    }
  }, initTodos); // 初回実行時にこの値から処理が始まります。その後は"前回の結果の続き"から処理を始めます。
}

// dispatcher$の型がObservable<Action>ではなく<ActionTypeFilter>なのは、Filterの操作に必要なものだけ見せるという配慮です。
function filterStateReducer(initFilter: string, dispatcher$: Observable<ActionTypeFilter>): Observable<string> {
  // Componentで"dispatcher$.next()"したとき、このscanのサイクルが回ります。それ以外では回ることはなく、ずっとnextを待機しています。
  return dispatcher$.scan<string>((filter: string, action: ActionTypeFilter) => { // "rxjs scan"でググる。
    if (action instanceof SetVisibilityFilter) { // actionがSetVisibilityFilterの場合。
      return action.filter;
    } else { // actionがSetVisibilityFilterではない場合。
      return filter; // 引数の値をそのまま返す。
    }
  }, initFilter); // 初回実行時にこの値から処理が始まります。その後は"前回の結果の続き"から処理を始めます。
}

// ただのヘルパーです。あまり気にしなくて良い。
function merge<T>(obj1: T, obj2: {}): T {
  let obj3 = {};
  for (let attrname in obj1) {
    obj3[attrname] = obj1[attrname];
  }
  for (let attrname in obj2) {
    obj3[attrname] = obj2[attrname];
  }
  return obj3 as T;
}


////////////////////////////////////////////////////////////////////////////////////
// -- DI config
/*
  DI設定。Savkin's Fluxの要。ViewとLogicを巧妙に分離しています。最初は黒魔術かと思うかも。
  https://laco0416.github.io/post/platform-prividers-of-angular-2/ を参考にすると理解の助けになるかもしれません。
  Providerはprovide()で書いても良いですが個人的にはbind()の方が書きやすくて好きだです。provideはGrunt、bindはGulpみたいな感じ？
*/
// RxJSのSubjectクラスを継承してDispatcherクラスを作ります。機能は変わりません。このクラスはDIで使うだけです。
// Dispatcherをクラスとして用意しておくことでComponentのDIに関する記述がシンプルになります。
class Dispatcher<T> extends Subject<T> {
  constructor(destination?: Observer<T>, source?: Observable<T>) { // constructorの記述はRxJSのソースから拝借しました。
    super(destination, source);
  }
}

// TodoAppコンポーネントのprovidersにセットしており、Angular2のbootstrap時にインスタンス化されComponentに紐付けられます。(@laco0416 さんありがとう！)
// Containerのインスタンスを生成するときにinitStateとdispatcherを引数にあてている(クロージャしている)ので、
// Componentで"dispatcher$.next()"したときにContainer内部のObservable.scanのサイクルが回ります。ちょっとしたトリックみたいなものです。
const stateAndDispatcher = [
  bind('initState').toValue({ todos: [], visibilityFilter: 'SHOW_ALL' } as AppState), // Componentから参照しないのでOpaqueTokenは使っていません。
  bind(Dispatcher).toValue(new Dispatcher<Action>(null)), // 超重要です。Containerに仕込んでおくことでComponentからリモート発火装置のように使います。
  bind(Container).toFactory((state, dispatcher) => new Container(state, dispatcher), ['initState', Dispatcher]) // toFactoryの第二引数はTokenの配列であることに注意。bootstrap時にTokenを通じて値がContainerの引数にあてられます
];


////////////////////////////////////////////////////////////////////////////////////
// -- Components
/* 
  コンポーネント群。View描画に必要なもの。
  重要なのはDIが書いてある部分とそれらが影響している箇所だけです。その他は流し読みで構わないでしょう。 
  3ヶ所出てくるthis.dispatcher$.next()が一体何をしているのか、連鎖して何が起きているのか、僕は最後までそれを理解するのに苦労しました。
  結論から言うとdispatcherのnextから始まるストリームは巡り巡って"container.state$.map(...)"に行き着きます。
*/
// TodoListコンポーネントの子コンポーネント。
@Component({
  selector: 'todo',
  template: `
    <span (click)="toggle.next()" [style.textDecoration]="textEffect">
      {{todo.text}}
    </span>
  `
})
class TodoComponent {
  @Input() todo: Todo;
  @Output() toggle = new EventEmitter(); // "angular2 eventemitter"でググる。

  get textEffect() {
    return this.todo.completed ? 'line-through' : 'none';
  }
}

// TodoAppコンポーネントの子コンポーネント。
@Component({
  selector: 'todo-list',
  template: `
    <todo *ngFor="#t of filtered|async"
      [todo]="t"
      (toggle)="emitToggle(t.id)"></todo>
  `,
  directives: [TodoComponent]
})
class TodoListComponent {
  constructor(
    private dispatcher$: Dispatcher<Action>, // DispatcherはSubjectを継承したクラス。オリジナルではここはObservaer<Action>になっています。
    private container: Container // Containerインスタンスへの参照を取得します。
  ) { }

  // 戻り値がObservableであるためtemplateではasyncパイプを付ける必要があります。"angular2 async pipe"でググる。
  get filtered() {
    // Containerの"statSubject.next()"で流れるストリームをここで受けます。"dispatcher$.next()"から始まるストリームの旅の終点です。
    return this.container.state$.map<Todo[]>((state: AppState) => {
      return getVisibleTodos(state.todos, state.visibilityFilter);
    });
  }

  emitToggle(id: number) {
    // .nextで即座にストリームを流しています。これを受けるのはContainerのObservable.scanです。
    this.dispatcher$.next(new ToggleTodoAction(id));
  }
}

// ただのヘルパーです。あまり気にしなくて良い。
function getVisibleTodos(todos: Todo[], filter: string): Todo[] {
  return todos.filter(todo => {
    if (filter === "SHOW_ACTIVE") { // filterがSHOW_ACTIVEならcompletedがfalseのものだけ返す。
      return !todo.completed;
    }
    if (filter === "SHOW_COMPLETED") { // filterがSHOW_COMPLETEDならcompletedがtrueのものだけ返す。
      return todo.completed;
    }
    return true; // 上記以外なら全て返す。
  });
}

// TodoAppコンポーネントの子コンポーネント。
@Component({
  selector: 'add-todo',
  template: `
    <input #text><button (click)="addTodo(text.value)">Add Todo</button>
  `
})
class AddTodoComponent {
  private nextId = 0;

  constructor(
    private dispatcher$: Dispatcher<Action> // DispatcherはSubjectを継承したクラス。オリジナルではここはObservaer<Action>になっています。
  ) { }

  addTodo(value: string) {
    // .nextで即座にストリームを流しています。これを受けるのはContainerのObservable.scanです。
    this.dispatcher$.next(new AddTodoAction(this.nextId++, value)); // "rxjs subject next"でググる。
  }
}

// Footerコンポーネントの子コンポーネント。
@Component({
  selector: 'filter-link',
  template: `
    <a href="#" (click)="setVisibilityFilter()"
      [style.textDecoration]="textEffect|async"><ng-content></ng-content></a>
  `
})
class FilterLinkComponent {
  @Input() filter: string;

  constructor(
    private dispatcher$: Dispatcher<Action>, // DispatcherはSubjectを継承したクラス。オリジナルではここはObservaer<Action>になっています。
    private container: Container // Containerインスタンスへの参照を取得します。
  ) { }

  // 選択中のフィルター名にアンダーラインを引く。
  // 戻り値がObservableであるためtemplateではasyncパイプを付ける必要があります。"angular2 async pipe"でググる。
  get textEffect() {
    // Containerの"statSubject.next()"で流れるストリームをここで受けます。"dispatcher$.next()"から始まるストリームの旅の終点です。
    return this.container.state$.map<string>((state: AppState) => {
      return state.visibilityFilter === this.filter ? 'underline' : 'none';
    });
  }

  setVisibilityFilter() {
    // .nextで即座にストリームを流しています。これを受けるのはContainerのObservable.scanです。
    this.dispatcher$.next(new SetVisibilityFilter(this.filter));
  }
}

// TodoAppコンポーネントの子コンポーネント。
@Component({
  selector: 'footer',
  template: `
    <filter-link filter="SHOW_ALL">All</filter-link>
    <filter-link filter="SHOW_ACTIVE">Active</filter-link>
    <filter-link filter="SHOW_COMPLETED">Completed</filter-link>
  `,
  directives: [FilterLinkComponent]
})
class FooterComponent { }

// 最上位のコンポーネント。
@Component({
  selector: 'ng-demo',
  template: `
    <add-todo></add-todo>
    <todo-list></todo-list>
    <footer></footer>
  `,
  directives: [AddTodoComponent, TodoListComponent, FooterComponent],
  providers: [stateAndDispatcher], // stateAndDispatcherのDIが全ての子コンポーネントに影響します。
  changeDetection: ChangeDetectionStrategy.OnPush // OnPushストラテジーが全ての子コンポーネントに影響します。
})
class TodoApp { }


enableProdMode(); // 動作が2倍くらい速くなるらしい。プロダクション環境では推奨です。(@laco0416 さんありがとう！)
bootstrap(TodoApp) // TodoAppコンポーネントのprovidersにセットしたProvider達はこのときに一度だけインスタンス化されます。
  .catch(err => console.error(err));


////////////////////////////////////////////////////////////////////////////////////
// 最後に  
/*
  Containerクラスの下記の一節はVictor Savkinによるアートです。解説をしますが僕の解釈なので100%鵜呑みにはしないでください。
  
    Observable.zip(Observable.scan, Observable.scan).subscribe(Subject.next());
    
  (DispatcherはSubjectを継承したクラスであることをもう一度思い出してください)
  (ちなみにSubjectはObservableを継承したクラスです。これも重要なポイントです)
  
  1. Componentで"dispatcher$.next()"すると2つのObservable.scanの処理が走ります。(Subjectはnextすることで自分で自分を発火できる)
  2. Observable.zipはRxJSのInnerSubscriberという仕組みを通じて、内包する2つのObservable.scanを監視しています。
  3. 内包する全てのObservableのストリームを受けるとzipは次にストリームを流します。
  4. subscribeの中ではStateを管理しているSubjectのnextをコールして"新しいState"を次に流します。
  5. 上記4はどこにストリームを流す？Componentの"container.state$.map(...)"に、です。
  
  大まかな循環サイクルは下記のようになります。Componentから始まり見事にComponentに返ってきていますね。
  Component -> dispatcher$.next -> scan -> zip -> subscribe -> stateSubject.next -> map(Component) -> Viewへの反映 
  
  SavkinはRxJSのSubjectを2つの場所で実に巧妙に使っています。
  1つはComponentからContainerのObservable.scanへAction(データ)を送り込む用途として。
  もう1つは上記で始まった一連のストリームの最後でContainerのStateをComponentに送り込む用途として。
    
  特に後者はBehaviorSubjectという特殊なSubjectを用いており、初期値をセットできます。
  Savkinはこの特徴とObservable.scanによる値の保持を、FluxやReduxで言うところのStoreの代わりに使っています。
    
  総じて重要なのは、送り込む先に事前にクロージャしておくことでリモート操作するようにSubjectを使いこなしている点です。
  まるで遠隔操作系のスタンド能力のようですね。元ネタがわからない人はスルーしてください。
  僕は最初この流れが全く理解できなくてどこで何が起きているのかさっぱりわかりませんでした。
  RxJSの理解が浅い人はきっと同じ思いをすると思います。
  僕自身このリポジトリを何回書き直したかわかりません。理解できたと思った次の日に、あれ、違った？と思ったことが何回あったか。
  このサンプルを理解するのは大変だと思います。でもVictor Savkinの天才脳に触れる貴重なサンプルでもあります。
  
  これを読んでくれた人がRxJSをより使いこなせるようになる、そんな一助になれば幸いです。 
*/