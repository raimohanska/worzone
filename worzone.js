$(function() {
  var bounds = Rectangle(0, 0, 500, 450)
  var r = Raphael(20, 20, bounds.width, bounds.height);
  var messageQueue = MessageQueue()
  var targets = Targets(messageQueue)

  Monsters(messageQueue, targets, r)
  Players(messageQueue, targets, r)

  var audio = Audio()
  GameSounds(messageQueue, audio)

  $('#sound').click(function() { audio.toggle() })

  Levels(messageQueue, targets, r)
})

function Levels(messageQueue, targets, r) {
  var gameOver = messageQueue.ofType("gameover").skip(1)
  var levelFinished = messageQueue.ofType("level-finished")
  var startGame = Keyboard().anyKey.take(1)
  var startScreen = AsciiGraphic(startScreenData(), 7, 7, Point(50, 150)).render(r).attr({ fill : "#F00"})
  startGame.onValue(removeElements(startScreen))

  var levelStarting = levelFinished
    .merge(startGame)
    .scan(0, function(prev, _) { return prev + 1 })
    .map(function(level) { return { message : "level-starting", level : level} })
    .changes()
  var levels = levelStarting
    .delay(4000)
    .map(function(level) {
      var levelEnd = levelFinished.merge(gameOver)
      return { message : "level-started", level : level.level, maze : Maze(level.level), levelEnd : levelEnd }
    })
  levelStarting.onValue(function() {
    var getReady = AsciiGraphic(getReadyData(), 7, 7, Point(30, 80)).render(r)
    setTimeout(function() {
      var go = AsciiGraphic(goData(), 7, 7, Point(200, 170)).render(r)
      setTimeout(removeElements([getReady, go]), 2000)
    }, 2000)
  })

  levels.onValue(function(level) {
    level.maze.draw(level.levelEnd, r)
    var pos = level.maze.levelNumberPos()
    var text = r.text(pos.x, pos.y, "Level " + level.level).attr({ fill : "#FF0"})
    level.levelEnd.onValue(removeElements(text))
  })

  levels.toProperty().sampledBy(gameOver).onValue(function(level){
    var pos = level.maze.centerMessagePos()
    r.text(pos.x, pos.y, "GAME OVER").attr({ fill : "#f00", "font-size" : 50, "font-family" : "courier"})
  })

  messageQueue.ofType("fire").onValue(function(fire) {
    function targetFilter(target) {
      if (fire.shooter.monster && target.monster) return false;
      return fire.shooter != target
    }
    Bullet(fire.pos, fire.shooter, fire.dir, fire.maze, targets, targetFilter, messageQueue, r)
  })

  messageQueue.plug(levels)
  messageQueue.plug(levelStarting)
}

function GameSounds(messageQueue, audio) {
  function sequence(delay, count) {
    return ticker(delay).scan(1, function(counter, _) { return counter % count + 1} ).changes()
  }
  levelStarted = messageQueue.ofType("level-started").map(always(true))
    .merge(messageQueue.ofType("level-finished").map(always(false)))
    .toProperty(false)
  sequence(500, 3)
    .filterWithProperty(levelStarted)
    .onValue(function(counter) { audio.playSound("move" + counter)() })
  messageQueue.ofType("start")
    .filter(function (start) { return start.object.player })
    .map(function(start) { return start.object.player.id })
    .onValue(function(id) { audio.playSound("join" + id)() })
  messageQueue.ofType("fire").onValue(audio.playSound("fire"))
  messageQueue.ofType("hit").onValue(audio.playSound("explosion"))
  messageQueue.ofType("level-starting").onValue(audio.playSound("intro1"))
}

function Audio() {
  var on = false
  var sounds = {}

  function loadSound(soundName) {
    var audioElement = document.createElement('audio')
    audioElement.setAttribute('src', "audio/" + soundName + ".ogg")
    return audioElement
  }

  function getSound(soundName) {
    if (!sounds[soundName]) {
      sounds[soundName] = loadSound(soundName)
    }
    return sounds[soundName]
  }
  function play(soundName) {
    if (on) getSound(soundName).play()
  }
  return {
    playSound : function(soundName) { return function() { play(soundName) }},
    toggle : function() { on = !on; }
  }
}

function Players(messageQueue, targets, r) {
  var player1 = Player(1, KeyMap([[87, up], [83, down], [65, left], [68, right]], [70]), targets, messageQueue, r)
  var player2 = Player(2, KeyMap([[38, up], [40, down], [37, left], [39, right]], [189, 109, 18]), targets, messageQueue, r)
}

function Monsters(messageQueue, targets, r) {
  messageQueue.ofType("level-started").onValue(function(level) {
    var maze = level.maze
    function burwor() { Burwor(level.level * 0.5 + 1, maze, messageQueue, targets, r) }
    function garwor() { Garwor(level.level * 0.5 + 1, maze, messageQueue, targets, r) }
    _.range(0, 5).forEach(burwor)
    var monsterHit = messageQueue.ofType("hit")
      .filter(function (hit) { return hit.target.monster })
    var levelFinished = monsterHit
      .skip(15)
      .map(always({ message : "level-finished"}))
      .take(1)
    monsterHit
      .delay(2000)
      .takeUntil(levelFinished)
      .onValue(garwor)
    ticker(5000)
      .takeUntil(levelFinished)
      .filter(function() { return (targets.count(Monsters.monsterFilter) < 10) })
      .onValue(burwor)
    messageQueue.plug(levelFinished)
  })
}
Monsters.monsterFilter = function(target) { return target.monster }

function KeyMap(directionKeyMap, fireKey) {
  return {
    directionKeyMap : directionKeyMap,
    fireKey : fireKey
  }
}

function Player(id, keyMap, targets, messageQueue, r) {
  var player = {
    id : id,
    keyMap : keyMap,
    toString : function() { return "Player " + id}
  }
  var startLives = 3
  var death = messageQueue.ofType("hit")
    .filter(function (hit) { return hit.target.player == player })
  var lives = death
    .scan(startLives, function(lives, hit) { return lives - 1 })
    .map( function(lives) { return { message : "lives", player : player, lives : lives}})
  var gameOver = lives.changes()
    .filter(function(lives) { return lives.lives == 0})
    .map(function() { return { message : "gameover", player : player} } )
  var joinMessage = { message : "join", player : player}
  var levelStart = messageQueue.ofType("level-started")
  var join = death
    .merge(levelStart)
    .takeUntil(gameOver)
    .map(always(joinMessage))
  Score(player, messageQueue, r)
  LivesDisplay(player, lives, messageQueue, r)
  levelStart.toProperty().sampledBy(join).onValue(function(level) { PlayerFigure(player, level.maze, messageQueue, targets, r) })
  messageQueue.plug(join)
  messageQueue.plug(lives)
  messageQueue.plug(gameOver)
  return player;
}

function LivesDisplay(player, lives, messageQueue, r) {
  messageQueue.ofType("level-started")
    .DecorateWithLatestOf(lives, "lives").onValue(function(level) {
      var pos = level.maze.playerScorePos(player)
      _.range(0, level.lives.lives - 1).forEach(function(index) {
        var image = PlayerImage(player).create(pos.add(Point(index * 20, 10)), 8, r)
        lives
          .filter(function(lives) { return lives.lives <= index + 1})
          .merge(level.levelEnd)
          .onValue(removeElements(image))
      })
    })
}

function Score(player, messageQueue, r) {
  var score = messageQueue.ofType("hit")
    .filter(function(hit) { return hit.shooter && hit.shooter.player == player} )
    .map(function(hit) { return hit.target.points })
    .scan(0, function(current, delta) { return current + delta })
  messageQueue.plug(score.map(function(points) { return { message : "score", player : player, score : points} } ))
  messageQueue.ofType("level-started").DecorateWithLatestOf(score, "score").onValue(function(level){
    var pos = level.maze.playerScorePos(player)
    var scoreDisplay = r.text(pos.x, pos.y - 10, level.score).attr({ fill : "#ff0"})
    score.takeUntil(level.levelEnd).onValue(function(points) { scoreDisplay.attr({ text : points }) })
    level.levelEnd.onValue(function(){ scoreDisplay.remove() })
  })
}

function ControlInput(directionInput, fireInput) {
    return {directionInput : directionInput, fireInput : fireInput}
}

function Targets(messageQueue) {
  var targets = []
  messageQueue.ofType("remove").onValue(function(remove) {
    targets = _.select(targets, function(target) { return target != remove.object})
  })
  messageQueue.ofType("create").onValue(function(create) {
    targets.push(create.target)
  })
  function targetThat(predicate) {
     return first(_.select(targets, predicate))
  }
  return {
    hit : function(pos, filter) { return this.inRange(pos, 0, filter) },
    inRange : function(pos, range, filter) { return targetThat(function(target) {
        return target.inRange(pos, range) && filter(target) })},
    byId : function(id) { return targetThat(function(target) { return target.id == id })},
    count : function(filter) { return _.select(targets, filter).length},
    select : function(filter) { return _.select(targets, filter) }
  }
}

function Bullet(startPos, shooter, velocity, maze, targets, targetFilter, messageQueue, r) {
  var radius = 3
  var bullet = r.circle(startPos.x, startPos.y, radius).attr({fill: "#f00"})
  bullet.radius = radius
  var movements = bulletTicker.map(function(_) {return velocity})
  var unlimitedPosition = movements
    .scan(startPos, function(pos, move) { return pos.add(move) })
  var collision = unlimitedPosition.changes().filter(function(pos) { return !maze.isAccessible(pos, radius, radius) }).take(1)
  var hit = unlimitedPosition.changes()
    .filter(function(pos) { return targets.hit(pos, targetFilter) })
    .map(function(pos) { return { message : "hit", target : targets.hit(pos, targetFilter), shooter : shooter}})
    .take(1)
    .takeUntil(collision)
  var hitOrCollision = collision.merge(hit)
  var position = unlimitedPosition.sampledBy(gameTicker).takeUntil(hitOrCollision)

  position.onValue(function (pos) { bullet.animate({cx : pos.x, cy : pos.y}, delay) })
  hitOrCollision.onValue(function(pos) { bullet.remove() })
  messageQueue.plug(hit)
}

function PlayerImage(player) {
  return FigureImage("man", 2, 2)
}

function PlayerFigure(player, maze, messageQueue, targets, r) {
  var directionInput = Keyboard().multiKeyState(player.keyMap.directionKeyMap).map(first)
  var fireInput = Keyboard().keyDowns(player.keyMap.fireKey)
  var controlInput = ControlInput(directionInput, fireInput)
  var startPos = maze.playerStartPos(player)
  function access(pos) { return maze.isAccessible(pos, 16) }
  var man = Figure(startPos, PlayerImage(player), controlInput, maze, access, messageQueue, r)
  man.player = player
  man.points = 1000
  var hitByMonster = man.streams.position
    .sampledBy(gameTicker)
    .filter(function(status) { return targets.inRange(status.pos, man.radius, Monsters.monsterFilter) })
    .map(function(pos) { return { message : "hit", target : man}})
    .take(1)
  messageQueue.plug(hitByMonster)
  return man
}

function FigureImage(imgPrefix, animCount, animCycle) {
  imgPrefix = imgPath + imgPrefix
  function flip(img, f) {
    var x = img.attrs.x,
        y = img.attrs.y;
    img.scale(f, 1);
    img.attr({x:x, y:y});
  }
  function rotate(img, absoluteRotation) {
    img.rotate(absoluteRotation, img.attrs.x + img.attrs.width/2, img.attrs.y + img.attrs.height/2);
  }
  return {
    create : function(startPos, radius, r) {
      return r.image(imgPrefix + "-left-1.png", startPos.x - radius, startPos.y - radius, radius * 2, radius * 2)
    },
    animate : function(figure, status) {
      var animationSequence = status.bufferWithCount(animCycle).scan(1, function(prev, _) { return prev % animCount + 1})
      var animation = status.combine(animationSequence, function(status, index) {
        return { image :  imgPrefix + "-left-" + index + ".png", dir : status.dir }
      })
      animation.onValue(function(anim) {
        if(figure.removed) return;
        figure.attr({src : anim.image})
        if(anim.dir == left) {
          // when facing left, use the pic as is
          flip(figure, 1)
          rotate(figure, 0)
        } else {
          // when facing any other way, flip the pic and then rotate it
          flip(figure, -1)
          rotate(figure, anim.dir.getAngleDeg())
        }
      })
    }
  }
}

function Burwor(speed, maze, messageQueue, targets, r) {
  return Monster(speed, FigureImage("burwor", 2, 10), 100, 5000, maze, messageQueue, targets, r)
}

function Garwor(speed, maze, messageQueue, targets, r) {
  return Monster(speed, FigureImage("garwor", 3, 2), 200, 2000, maze, messageQueue, targets, r)
}

function Monster(speed, image, points, fireInterval, maze, messageQueue, targets, r) {
  var fire = ticker(fireInterval).filter( function() { return Math.random() < 0.1 })
  var direction = MessageQueue()
  function access(pos) { return maze.isAccessibleByMonster(pos, 16) }
  var startPos = maze.randomFreePos(function(pos) {
    return access(pos) && targets.select(function(target){ return target.player && target.inRange(pos, 100) }).length == 0
  })
  var monster = Figure(startPos, image, ControlInput(direction, fire), maze, access, messageQueue, r)
  monster.speed = speed
  monster.monster = true
  monster.points = points
  direction.plug(monster.streams.position.sampledBy(gameTicker).scan(left, function(current, status) {
    function canMove(dir) { return access(status.pos.add(dir)) }
    if (canMove(current)) return current
    var possible = _.select([left, right, up, down], canMove)
    return possible[randomInt(possible.length)]
  }))
}

function Movement(figure, access) {
  function moveIfPossible(pos, direction, speed) {
    if (speed == undefined) speed = figure.speed
    if (speed <= 0) return pos
    var nextPos = pos.add(direction.times(speed))
    if (!access(nextPos, figure.radius))
      return moveIfPossible(pos, direction, speed -1)
    return nextPos
  }

  return {
    moveIfPossible: moveIfPossible
  }
}

function Figure(startPos, image, controlInput, maze, access, messageQueue, r) {
    var radius = 16
    var figure = image.create(startPos, radius, r)
    figure.radius = radius
    figure.speed = 4
    var hit = messageQueue.ofType("hit").filter(function(hit) { return hit.target == figure }).take(1)
    var levelFinished = messageQueue.ofType("level-finished").take(1)
    var removed = hit.merge(levelFinished).take(1).map(always({ message : "remove", object : figure}))

    var direction = controlInput.directionInput.takeUntil(removed)
    var latestDirection = direction.filter(identity).startWith(left)
    var movements = direction.sampledBy(gameTicker).filter(identity).takeUntil(removed)
    var position = movements.scan(startPos, Movement(figure, access).moveIfPossible)

    position.onValue(function (pos) { figure.attr({x : pos.x - radius, y : pos.y - radius}) })
    hit.onValue(function() {
      // TODO: fix timing issue : shouldn't have to delay before gif change
      setTimeout(function(){ figure.attr({src : imgPath + "explosion.png"}) }, 100)
      setTimeout(function(){ figure.remove() }, 1000)
    })
    levelFinished.onValue(function() { figure.remove() })

    var status = position.combine(latestDirection, function(pos, dir) {
      return { message : "move", object : figure, pos : pos, dir : dir }
    })

    image.animate(figure, status)

    var fire = status.sampledBy(controlInput.fireInput).map(function(status) {
      return {  message : "fire", pos : status.pos.add(status.dir.withLength(radius + 5)),
                dir : status.dir, shooter : figure, maze : maze,
             }
    }).takeUntil(removed)

    var start = movements.take(1).map(function() { return { message : "start", object : figure} })
    messageQueue.plug(start)
    messageQueue.plug(fire)
    messageQueue.plug(removed)
    figure.inRange = function(pos, range) { return position.currentValue().subtract(pos).getLength() < range + radius }
    messageQueue.push({ message : "create", target : figure })
    figure.streams = {
      position : status
    }
    return figure
}

function Keyboard() {
  var allKeyUps = $(document).asEventStream("keyup")
  var allKeyDowns = $(document).asEventStream("keydown")
  //allKeyDowns.onValue(function(event) {console.log(event.keyCode)})
  function keyCodeIs(keyCode) { return function(event) { return event.keyCode == keyCode} }
  function keyCodeIsOneOf(keyCodes) { return function(event) { return keyCodes.indexOf(event.keyCode) >= 0} }
  function keyUps(keyCode) { return allKeyUps.filter(keyCodeIs(keyCode)) }
  function keyDowns(keyCodes) {
    return allKeyDowns.filter(keyCodeIsOneOf(toArray(keyCodes)))
  }
  function keyState(keyCode, value) {
    return keyDowns(keyCode).map(always([value])).
      merge(keyUps(keyCode).map(always([]))).toProperty([])
  }
  function multiKeyState(keyMap) {
    var streams = keyMap.map(function(pair) { return keyState(pair[0], pair[1]) })
    return Rx.Observable.CombineLatestAsArray(streams)
  }
  return {
    multiKeyState : multiKeyState,
    keyDowns : keyDowns,
    anyKey : allKeyDowns
  }
}

function MessageQueue() {
    function remove(xs, x) {
       xs.splice(xs.indexOf(x), 1)
    }
    function Subscription(observable) {
      var disposable
      function cancel() { remove(subscriptions, subscription)}
      function push(message) { messageQueue.push(message) }
      function start() {
        disposable = observable.onValue( push, cancel)
      }
      function stop() {
        if (disposable) disposable.Dispose()
      }
      var subscription = {
        start : start, stop : stop
      }
      subscriptions.push(subscription)
      if (observers.length > 0) { start() }
      return subscription;
    }
    var subscriptions = []
    var observers = []
    var messageQueue = Rx.Observable.Create(function(observer) {
        observers.push(observer)
        if (observers.length == 1) {
          subscriptions.forEach(function(subscription) { subscription.start() })
        }
        return function() {
          remove(observers, observer);
          if (observers.length == 0) {
            subscriptions.forEach(function(subscription) { subscription.stop() })
          }
        }
    })
    messageQueue.ofType = function(messageType) { return messageQueue.filter(function(message) { return message.message == messageType})}
    messageQueue.push = function (message) {
        observers.map(identity).forEach(function(observer) {
            observer.OnNext(message)
        });
        return messageQueue
    }
    messageQueue.plug = function (observable) {
        Subscription(observable)
        return messageQueue
    }
    return messageQueue
}

var mazes = [
  [ "*******************",
    "*                 *",
    "* *******  ****** *",
    "* *             * *",
    "* *   *******   * *",
    "* *   *     *   * *",
    "* *             * *",
    "*        C        *",
    "* *   *******   * *",
    "* *             * *",
    "* *             * *",
    "* *             * *",
    "* *******  ****** *",
    "*                 *",
    "* *************** *",
    "*1*5XXXXXLXXXX60*2*",
    "***XXXXXXXXXXXXX***" ],

    [ "*******************",
      "*                 *",
      "* *******  ****** *",
      "* *             * *",
      "* * * ******* * * *",
      "* * * *     * * * *",
      "* * * *     * * * *",
      "* * *    C    *   *",
      "* * * *** *** *****",
      "* * *   * * * *   *",
      "* * * * * * * * * *",
      "*   * *         * *",
      "***** *** * ***** *",
      "*       * *       *",
      "* *************** *",
      "*1*5XXXXXLXXXX60*2*",
      "***XXXXXXXXXXXXX***" ]
]


function Maze(level) {
  var data = mazes[(level + 1) % 2]
  var blockSize = 50
  var wall = 5
  var ascii = AsciiGraphic(data, blockSize, wall)

  function isWall(blockPos) { return ascii.isChar(blockPos, "*") }
  function isFree(blockPos) { return ascii.isChar(blockPos, "C ") }

  function findMazePos(character) {
    function blockThat(predicate) {
      return ascii.forEachBlock(function(blockPos) {
        if (predicate(blockPos)) { return blockPos}
      })
    }
    return blockThat(function(blockPos) { return ascii.isChar(blockPos, character)})
  }

  function accessible(pos, objectRadiusX, objectRadiusY, predicate) {
    if (!objectRadiusY) objectRadiusY = objectRadiusX
    var radiusX = objectRadiusX
    var radiusY = objectRadiusY
    for (var x = ascii.toBlockX(pos.x - radiusX); x <= ascii.toBlockX(pos.x + radiusX); x++)
      for (var y = ascii.toBlockY(pos.y - radiusY); y <= ascii.toBlockY(pos.y + radiusY); y++)
        if (!predicate(Point(x, y))) return false
    return true
  }
  return {
    levelNumberPos : function() {
      return ascii.blockCenter(findMazePos("L"))
    },
    centerMessagePos : function() {
      return ascii.blockCenter(findMazePos("C"))
    },
    playerStartPos : function(player) {
      return ascii.blockCenter(findMazePos("" + player.id))
    },
    playerScorePos : function(player) {
      var number = Number(player.id) + 4
      return ascii.blockCenter(findMazePos("" + number))
    },
    isAccessible : function(pos, objectRadiusX, objectRadiusY) {
      return accessible(pos, objectRadiusX, objectRadiusY, function(blockPos) { return !isWall(blockPos) })
    },
    isAccessibleByMonster : function(pos, objectRadiusX, objectRadiusY) {
      return accessible(pos, objectRadiusX, objectRadiusY, function(blockPos) { return isFree(blockPos) })
    },
    randomFreePos : function(filter) {
      while(true) {
        var pixelPos = ascii.blockCenter(ascii.randomBlock())
        if (filter(pixelPos)) return pixelPos
      }
    },
    draw : function(levelEnd, raphael) {
      var elements = ascii.renderWith(raphael, function(block) {
          if (isWall(block)) {
            var corner = ascii.blockCorner(block)
            var size = ascii.sizeOf(block)
            return raphael.rect(corner.x, corner.y, size.x, size.y).attr({ stroke : "#008", fill : "#008"})
          }
      })
      levelEnd.onValue(function() {
        elements.remove()
      })
    }
  }
}

function AsciiGraphic(data, blockSize, wall, position) {
  if (!wall) wall = blockSize
  if (!position) position = Point(0, 0)
  var width = data[0].length
  var height = data.length
  var fullBlock = blockSize + wall

  function charAt(blockPos) {
    if (blockPos.y >= height || blockPos.x >= width || blockPos.x < 0 || blockPos.y < 0) return "X"
    return data[blockPos.y][blockPos.x]
  }
  function isChar(blockPos, chars) {
    return chars.indexOf(charAt(blockPos)) >= 0
  }
  function isWall(blockPos) { return isChar(blockPos, "*") }
  function isFree(blockPos) { return isChar(blockPos, "C ") }
  function blockCorner(blockPos) {
    function blockToPixel(block) {
       var fullBlocks = Math.floor(block / 2)
       return fullBlocks * fullBlock + ((block % 2 == 1) ? wall : 0)
    }
    return Point(blockToPixel(blockPos.x) + position.x, blockToPixel(blockPos.y) + position.y)
  }
  function blockCenter(blockPos) {
    return blockCorner(blockPos).add(sizeOf(blockPos).times(.5))
  }
  function sizeOf(blockPos) {
    function size(x) { return ( x % 2 == 0) ? wall : blockSize}
    return Point(size(blockPos.x), size(blockPos.y))
  }
  function toBlock(x) {
    var fullBlocks = Math.floor(x / fullBlock)
    var remainder = x - (fullBlocks * fullBlock)
    var wallToAdd = ((remainder >= wall) ? 1 : 0)
    return fullBlocks * 2 + wallToAdd
  }
  function toBlockX(x) {
    return toBlock(x - position.x)
  }
  function toBlockY(y) {
    return toBlock(y - position.y)
  }
  function toBlocks(pixelPos) {
    return Point(toBlockX(pixelPos.x), toBlockY(pixelPos.y))
  }
  function forEachBlock(fn) {
    for (var x = 0; x < width; x++) {
      for (var y = 0; y < height; y++) {
        var result = fn(Point(x, y))
        if (result)
          return result;
      }
    }
  }
  function randomBlock() {
    return Point(randomInt(width), randomInt(height))
  }
  function render(r) {
    return renderWith(r, function(block) {
      if (!isChar(block, " "))
        return r.text(blockCenter(block).x, blockCenter(block).y, charAt(block)).attr({ fill : "#f00", "font-family" : "Courier New, Courier", "font-size" : blockSize * 1.7})
    })
  }
  function renderWith(r, blockRenderer) {
    var elements = r.set()
    forEachBlock(function(block) {
      var element = blockRenderer(block)
      if (element) elements.push(element)
    })
    return elements
  }
  return {  isChar : isChar,
            toBlockX : toBlockX,
            toBlockY : toBlockY,
            blockCorner : blockCorner,
            blockCenter : blockCenter,
            forEachBlock : forEachBlock,
            sizeOf : sizeOf,
            randomBlock : randomBlock ,
            render : render,
            renderWith : renderWith}
}

function getReadyData() { return [
"  ____   _____  ______    ____    _____    __    ____    __  __  ",
" ______  _____  ______    _____   _____   ____   _____   __  __  ",
" __      __       __      __  __  __     __  __  __  __  __  __  ",
" __      __       __      __  __  __     __  __  __  __  __  __  ",
" __  __  _____    __      _____   _____  ______  __  __   ____   ",
" __  __  _____    __      ____    _____  ______  __  __    __    ",
" __  __  __       __      __ __   __     __  __  __  __    __    ",
" __  __  __       __      __  __  __     __  __  __  __    __    ",
" ______  _____    __      __  __  _____  __  __  _____     __    ",
"  ____   _____    __      __  __  _____  __  __  ____      __    "
]}
function goData() { return [
"  ____    ____  ",
" ______  ______ ",
" __      __  __ ",
" __      __  __ ",
" __  __  __  __ ",
" __  __  __  __ ",
" __  __  __  __ ",
" __  __  __  __ ",
" ______  ______ ",
"  ____    ____  "
]}
function startScreenData() { return [
" __  __  __   ____   ____   ______   ____   __   __  ______",
" __  __  __  ______  _____  ______  ______  __   __  ______",
" __  __  __  __  __  __  __     __  __  __  ___  __  __    ",
" __  __  __  __  __  __  __    __   __  __  ____ __  __    ",
" __  __  __  __  __  _____    __    __  __  __ ____  ______",
" __  __  __  __  __  ____    __     __  __  __  ___  ______",
" __  __  __  __  __  __ __  __      __  __  __   __  __    ",
"  ________   __  __  __  __ __      __  __  __   __  __    ",
"   __  __    ______  __  __ ______  ______  __   __  ______",
"   __  __     ____   __  __ ______   ____   __   __  ______",
"                                                           ",
"                                                           ",
"                                                           ",
"                                                           ",
"                 P R E S S   A N Y   K E Y                 ",
]}


var delay = 50
var left = Point(-1, 0), right = Point(1, 0), up = Point(0, -1), down = Point(0, 1)
var imgPath = "images/"

function randomInt(limit) { return Math.floor(Math.random() * limit) }
function identity(x) { return x }
function first(xs) { return xs ? xs[0] : undefined}
function latter (_, second) { return second }
function both (first, second) { return [first, second] }
function extractProperty(property) { return function(x) { return x.property } }
Rx.Observable.prototype.DecorateWithLatestOf = function(stream, name) {
  return this.CombineWithLatestOf(stream, function(main, additional) {
    var clone = _.clone(main)
    clone[name] = additional
    return clone
  })
}
Rx.Observable.CombineAll = function(streams, combinator) {
  var stream = streams[0]
  for (var i = 1; i < streams.length; i++) {
    stream = combinator(stream, streams[i])
  }
  return stream;
}
Rx.Observable.CombineLatestAsArray = function(streams) {
  return Rx.Observable.CombineAll(streams, function(s1, s2) { return s1.CombineLatest(s2, concatArrays)})
}
function toArray(x) { return !x ? [] : (_.isArray(x) ? x : [x])}
function concatArrays(a1, a2) { return toArray(a1).concat(toArray(a2)) }
var gameTicker = ticker(delay)
var bulletTicker = ticker(delay/20)
function ticker(interval) {
  Bacon.interval(interval)
}
function always(value) { return function(_) { return value } }
function atMostOne(array) { return array.length <= 1 }
function print(x) { console.log(x) }
function toConsole(stream, prefix) { stream.onValue( function(item) { console.log(prefix + ":" + item) })}
function Rectangle(x, y, width, height) {
    return {x : x, y : y, width : width, height : height}
}
function removeElements(elements) {
  return function() { toArray(elements).forEach(function(element){
    element.remove()}) }
}
