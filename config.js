// async/awaitを書けるようにbabelコンパイラを通すように変更した。
System.config({
  //use babel for compilation instead of typescript
  transpiler: 'babel', // 'typescript',
  //typescript compiler options
  // typescriptOptions: {
  //   emitDecoratorMetadata: true
  // },
  //map tells the System loader where to look for things
  map: {
    app: "./src",
    'babel-polyfill': 'https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.7.4/polyfill.min.js'
  },
  //packages defines our app package
  packages: {
    app: {
      // main: './main.js',
      main: './main.without.asyncpipe.js',
      defaultExtension: 'js',
      meta: {
        '*.js': { deps: ['babel-polyfill'] }
      }
    }
  }
});