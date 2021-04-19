Worzone
=======

This simple game, strongly inspired by the C64 classic Wizard Of Wor, is
an experiment on using Reactive Functional Programming on a game. I did
this first with RxJs (Reactive Extensions of Javascript) but lately I
wrote my own FRP framework, [bacon.js](http://github.com/raimohanska/bacon.js),
and converted Worzone to use that instead.

See the [online demo](https://raimohanska.github.io/worzone/).

I have described the basic ideas in my blog posting [Game Programming With
RxJs](http://nullzzz.blogspot.com/2011/02/game-programming-with-rx-js.html).

The switch from RxJs to Bacon.js did not dramatically change the
internal structure of the game, except for some simplification made
possible by including stuff like Bus in the framework itself.
Performance seems to be pretty much the same, too. Profiling with Chrome
shows that most CPU time is wasted in Raphaël rendering, so maybe I
(or you) should try replacing that with HTML canvas.
