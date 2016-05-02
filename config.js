/*
  tscによってes2015形式でコンパイルされたJSファイルをブラウザ上で動的にbabelでトランスパイルします。
  現状TypeScriptで書いたasync/awaitを動かすならビルド不要のこの方法が一番手間がかかりません。
*/
System.config({
  // babelトランスパイラを使います。ブラウザでbabel-core/5.8.34/browser.min.jsをロードしておくこと。
  // babel6ではなく5を使うことに注意してください。
  transpiler: 'babel',
  defaultJSExtensions: true,
  map: {
    app: "src", // System.import('app')と書いたらsrcフォルダを参照するという意味。

    // 下記2行はpackagesの記述とセットで書くことでangular2,rxjsのモジュールを動的にロードできます。
    'angular2': 'node_modules/angular2',
    'rxjs': 'node_modules/rxjs',
  },

  // mapでファイルではなくフォルダを指定した場合、packagesの設定も合わせて必要になります。
  packages: {
    // System.import('app')と書いたときにロードされるファイルをmainで指定しています。
    app: {
      // main: 'main',
      main: 'main.without.asyncpipe' // transpilerがbabelなので拡張子は自動的にjsだと見なされます。
    },

    // 下記2行の中身は空ですが、これを書かないとangular2,rxjsのモジュールを動的にロードできません。
    // mapでフォルダを指定しているので必要だというだけです。
    angular2: {},
    rxjs: {},
  }
});