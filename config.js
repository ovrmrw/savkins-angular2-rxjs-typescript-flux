/*
  tscによってes2015形式でコンパイルされたJSファイルをブラウザ上で動的にbabelでトランスパイルします。
  現状TypeScriptで書いたasync/awaitを動かすならビルド不要のこの方法が一番手間がかかりません。
*/ 
System.config({
  // babelトランスパイラを使います。ブラウザでbabel-core/5.8.34/browser.min.jsをロードしておくこと。
  // babel6ではなく5を使うことに注意してください。
  transpiler: 'babel',
  
  map: {
    app: "src", // System.import('app')と書いたらsrcフォルダを参照するという意味。
    
    // async/awaitを書くなら必要。下の方に出てくるdepCacheで'app'と依存関係を設定します。
    'babel-polyfill': 'https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.7.4/polyfill.min.js',
    
    // Angular2を使うのに必要。下の方に出てくるdepCacheで'app'と依存関係を設定します。
    'angular2-polyfills': 'node_modules/angular2/bundles/angular2-polyfills.js',
    
    // angular2-polyfillsの中でrequire('crypto')が記述されているので仕方なく組み込みます。
    'crypto': 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.2/rollups/md5.js',
    
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
  },
  
  // 依存関係の記述。'app'がロードされる前に2つのpolyfillをロードしなさいという指定です。
  // ここで指定しているのは上記のmapで記述した文字列であることに注意。
  depCache: {
    'app': ['babel-polyfill', 'angular2-polyfills'], // 'app'は'babel-polyfill'と'angular2-polyfills'依存しています。
  }
});