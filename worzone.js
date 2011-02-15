$(function() {
  var bounds = Rectangle(0, 0, 500, 450)
  var r = Raphael(20, 20, bounds.width, bounds.height);
  var maze = Maze(r)
  var messageQueue = MessageQueue()  
  var targets = Targets(messageQueue)

  Monsters(maze, messageQueue, targets, r)
  Players(maze, messageQueue, targets, r)

  messageQueue.ofType("fire").Subscribe(function(fire) { 
	  Bullet(fire.pos, fire.shooter, fire.dir, maze, targets, messageQueue, r) 
  })                 
  
  var audio = Audio()              
  GameSounds(messageQueue, audio)
  
  $('#sound').click(function() { audio.toggle() })
})

function GameSounds(messageQueue, audio) {
  function sequence(delay, count) {
    return ticker(delay).Scan(1, function(counter, _) { return counter % count + 1} )    
  }
  sequence(500, 3)
    .Subscribe(function(counter) { audio.playSound("move" + counter)() })
    messageQueue.ofType("start")
      .Where(function (move) { return move.object.player })
      .Select(function(move) { return move.object.player.id })
      .Subscribe(function(id) { audio.playSound("join" + id)() })    
  messageQueue.ofType("fire").Subscribe(audio.playSound("fire"))
  messageQueue.ofType("hit").Subscribe(audio.playSound("explosion"))  
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

function Players(maze, messageQueue, targets, r) {
  var player1 = Player(1, KeyMap([[87, up], [83, down], [65, left], [68, right]], [70]), maze, targets, messageQueue, r)
  var player2 = Player(2, KeyMap([[38, up], [40, down], [37, left], [39, right]], [189, 109, 18]), maze, targets, messageQueue, r)
}

function Monsters(maze, messageQueue, targets, r) {
  function burwor() { Burwor(maze, messageQueue, targets, r) }
  function garwor() { Garwor(maze, messageQueue, targets, r) } 
  _.range(0, 5).forEach(burwor)
  messageQueue.ofType("hit")
    .Where(function (hit) { return hit.target.monster })
    .Delay(2000)
    .Subscribe(garwor)                               
  ticker(5000)
    .Where(function() { return (targets.count(Monsters.monsterFilter) < 10) })
    .Subscribe(burwor)                               
}       
Monsters.monsterFilter = function(target) { return target.monster }  

function KeyMap(directionKeyMap, fireKey) {
	return {
		directionKeyMap : directionKeyMap,
		fireKey : fireKey
	}
}

function Player(id, keyMap, maze, targets, messageQueue, r) {
	var player = {
		id : id,
		keyMap : keyMap,
		toString : function() { return "Player " + id}
	}             
	Score(player, maze, messageQueue, r)
	var lives = messageQueue.ofType("hit")
	  .Where(function (hit) { return hit.target.player == player })
	  .Scan(3, function(lives, hit) { return lives - 1 })
	  .StartWith(3)
	  .Select( function(lives) { return { message : "lives", player : player, lives : lives}})
	var gameOver = lives
	  .Where(function(lives) { return lives.lives == 0})
	  .Select(function() { return { message : "gameover", player : player} } )
	var join = lives
	  .TakeUntil(gameOver)
    .Select(always({ message : "join", player : player}))    
  join.Subscribe(function(join) {
  	PlayerFigure(join.player, maze, messageQueue, targets, r)
  })	
  messageQueue.plug(join)  
	messageQueue.plug(lives)
	messageQueue.plug(gameOver)
	toConsole(gameOver, "GAME OVER " + player)
	return player;
}

function Score(player, maze, messageQueue, r) {                                        
  var score = messageQueue.ofType("hit")
    .Where(function(hit) { return hit.shooter && hit.shooter.player == player} )
    .Select(function(hit) { return hit.target.points })
    .Scan(0, function(current, delta) { return current + delta })
    .StartWith(0)
  score.Subscribe(function(points) { console.log(player + " has " + points + " points") })
  messageQueue.plug(score.Select(function(points) { return { message : "score", player : player, score : points} } ))

  var pos = maze.playerScorePos(player)
  var scoreDisplay = r.text(pos.x, pos.y, "0").attr({ fill : "#ff0"})

  score.Subscribe(function(points) { scoreDisplay.attr({ text : points }) })               
}             

function ControlInput(directionInput, fireInput) {
    return {directionInput : directionInput, fireInput : fireInput}
}

function Targets(messageQueue) {     
	var targets = []
	messageQueue.ofType("hit").Subscribe(function(hit) {
		targets = _.select(targets, function(target) { return target != hit.target})
	})                                                                                                   
	messageQueue.ofType("create").Subscribe(function(create) {
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

function LatestValueHolder(stream) {
	var value
	stream.Subscribe(function(newValue) { value = newValue})
	return { value : function() { return value }}
}

function Bullet(startPos, shooter, velocity, maze, targets, messageQueue, r) {      
  var targetFilter = always(true)
	var radius = 3
	var bullet = r.circle(startPos.x, startPos.y, radius).attr({fill: "#f00"})
	bullet.radius = radius
	var movements = gameTicker.Multiply(20).Select(function(_) {return velocity})
	var unlimitedPosition = movements
		.Scan(startPos, function(pos, move) { return pos.add(move) })
		.StartWith(startPos)
	var collision = unlimitedPosition.Where(function(pos) { return !maze.isAccessible(pos, radius, radius) }).Take(1)   
	var hit = unlimitedPosition
	  .Where(function(pos) { return targets.hit(pos, targetFilter) })
	  .Select(function(pos) { return { message : "hit", target : targets.hit(pos, targetFilter), shooter : shooter}})
	  .Take(1)                 
	  .TakeUntil(collision)
	var hitOrCollision = collision.Merge(hit)
	var position = unlimitedPosition.SampledBy(gameTicker).TakeUntil(hitOrCollision)
	
  position.Subscribe(function (pos) { bullet.animate({cx : pos.x, cy : pos.y}, delay) })
  hitOrCollision.Subscribe(function(pos) { bullet.remove() }) 
	messageQueue.plug(hit)
}      

function PlayerFigure(player, maze, messageQueue, targets, r) {
  var directionInput = Keyboard().multiKeyState(player.keyMap.directionKeyMap).Where(atMostOne).Select(first)
  var fireInput = Keyboard().keyDowns(player.keyMap.fireKey)
  var controlInput = ControlInput(directionInput, fireInput)
  var startPos = maze.playerStartPos(player)
  function access(pos) { return maze.isAccessible(pos, 16) }
  var man = Figure(startPos, FigureImage("man", 2, 2), controlInput, maze, access, messageQueue, r)
  man.player = player
  man.points = 1000
  var hitByMonster = man.streams.position
	  .SampledBy(gameTicker)
	  .Where(function(status) { return targets.inRange(status.pos, man.radius, Monsters.monsterFilter) })
	  .Select(function(pos) { return { message : "hit", target : man}})
	  .Take(1)
  messageQueue.plug(hitByMonster)
  return man
}

function FigureImage(imgPrefix, animCount, animCycle) {
  imgPrefix = imgPath + imgPrefix
  return {
    create : function(startPos, radius, r) {
      return r.image(imgPrefix + "-left-1.png", startPos.x - radius, startPos.y - radius, radius * 2, radius * 2)
    },
    animate : function(figure, statusStream) {
      var animationSequence = statusStream.BufferWithCount(animCycle).Scan(1, function(prev, _) { return prev % animCount + 1})
      var animation = statusStream.CombineLatest(animationSequence, function(status, index) { 
        if (status.dir == left) {
          return { image : imgPrefix + "-left-" + index + ".png", angle : 0 }
        }
        return { image :  imgPrefix + "-right-" + index + ".png", angle : status.dir.getAngleDeg() }
      })
      animation.Subscribe(function(anim) {
        figure.rotate(anim.angle, true)
        figure.attr({src : anim.image})
      })               
    }
  }
}

function Burwor(maze, messageQueue, targets, r) {
  return Monster(FigureImage("burwor", 2, 10), 100, 5000, maze, messageQueue, targets, r)
}

function Garwor(maze, messageQueue, targets, r) {  
  return Monster(FigureImage("garwor", 3, 2), 200, 2000, maze, messageQueue, targets, r)
}

function Monster(image, points, fireInterval, maze, messageQueue, targets, r) {
  var fire = ticker(fireInterval).Where( function() { return Math.random() < 0.1 })
  var direction = MessageQueue()
  function access(pos) { return maze.isAccessibleByMonster(pos, 16) }
  var startPos = maze.randomFreePos(function(pos) { 
    return access(pos) && targets.select(function(target){ return target.player && target.inRange(pos, 100) }).length == 0
  })
  var monster = Figure(startPos, image, ControlInput(direction, fire), maze, access, messageQueue, r)
  monster.speed = 2
  monster.monster = true      
  monster.points = points
  direction.plug(monster.streams.position.SampledBy(gameTicker).Scan(left, function(current, status) {
    function canMove(dir) { return access(status.pos.add(dir)) }
	  if (canMove(current)) return current
	  var possible = _.select([left, right, up, down], canMove)
	  return possible[randomInt(possible.length)]
  }).StartWith(left))
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
    var hit = messageQueue.ofType("hit").Where(function(hit) { return hit.target == figure }).Take(1)
    var direction = controlInput.directionInput.TakeUntil(hit).DistinctUntilChanged()
    var latestDirection = direction.Where(identity).StartWith(left)
    var movements = direction.SampledBy(gameTicker).Where(identity).TakeUntil(hit)
    var position = movements.Scan(startPos, Movement(figure, access).moveIfPossible).StartWith(startPos).DistinctUntilChanged()

    position.Subscribe(function (pos) { figure.attr({x : pos.x - radius, y : pos.y - radius}) })
    hit.Subscribe(function() {     
      figure.attr({src : imgPath + "explosion.png"})
      setTimeout(function(){ figure.remove() }, 1000)
    })                            

    var status = position.CombineLatest(latestDirection, function(pos, dir) {
  	  return { message : "move", object : figure, pos : pos, dir : dir }
    })         
    
    image.animate(figure, status)    

    var fire = status.SampledBy(controlInput.fireInput).Select(function(status) {             
  	  return {message : "fire", pos : status.pos.add(status.dir.withLength(radius + 5)), dir : status.dir, shooter : figure} 
    }).TakeUntil(hit)

    var start = movements.Take(1).Select(function() { return { message : "start", object : figure} })
    messageQueue.plug(start)
    messageQueue.plug(fire)        
    var currentPos = LatestValueHolder(position)
    figure.inRange = function(pos, range) { return currentPos.value().subtract(pos).getLength() < range + radius }
    messageQueue.push({ message : "create", target : figure })
    figure.streams = {
      position : status
    }
    return figure                                                          
}

function Keyboard() {
	var allKeyUps = $(document).toObservable("keyup")
	var allKeyDowns = $(document).toObservable("keydown")
	allKeyDowns.Subscribe(function(event) {console.log(event.keyCode)})
	function keyCodeIs(keyCode) { return function(event) { return event.keyCode == keyCode} }
	function keyCodeIsOneOf(keyCodes) { return function(event) { return keyCodes.indexOf(event.keyCode) >= 0} }
	function keyUps(keyCode) { return allKeyUps.Where(keyCodeIs(keyCode)) }
	function keyDowns(keyCodes) { 
	  return allKeyDowns.Where(keyCodeIsOneOf(toArray(keyCodes))) 
	}
	function keyState(keyCode, value) { 		
		return Rx.Observable.FromArray([[]]).Merge(keyDowns(keyCode).Select(always([value]))
			.Merge(keyUps(keyCode).Select(always([]))).DistinctUntilChanged())
	}
	function multiKeyState(keyMap) {
		var streams = keyMap.map(function(pair) { return keyState(pair[0], pair[1]) })
		return Rx.Observable.CombineLatestAsArray(streams)
	}	
	return {
		multiKeyState : multiKeyState,
		keyDowns : keyDowns
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
        disposable = observable.Subscribe( push, cancel)        
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
    messageQueue.ofType = function(messageType) { return messageQueue.Where(function(message) { return message.message == messageType})}
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

function Maze(raphael) {
	var data =
	  [ "*******************",
	    "*                 *",
	    "* *******  ****** *",
	    "* *             * *",
	    "* *   *******   * *",
	    "* *   *     *   * *",
	    "* *             * *",
	    "*                 *",
	    "* *   *******   * *",
	    "* *             * *",
	    "* *             * *",
	    "* *             * *",
	    "* *******  ****** *",
	    "*                 *",
	    "* *************** *",
	    "*1*5XXXXXXXXXXX6*2*",
	    "***XXXXXXXXXXXXX***" ]
	var blockSize = 50
	var wall = 4           
	var fullBlock = blockSize + wall
	var width = data[0].length
	var height = data.length
	function charAt(blockPos) {
	  if (blockPos.y >= height || blockPos.x >= width || blockPos.x < 0 || blockPos.y < 0) return "X"
		return data[blockPos.y][blockPos.x]
	}
	function isWall(blockPos) { return charAt(blockPos) == "*" }
	function isFree(blockPos) { return charAt(blockPos) == " " }
	function blockCorner(blockPos) {         
	  function blockToPixel(block) {
	     var fullBlocks = Math.floor(block / 2)
	     return fullBlocks * fullBlock + ((block % 2 == 1) ? wall : 0)
	  }
	  return Point(blockToPixel(blockPos.x), blockToPixel(blockPos.y))
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
	function toBlocks(pixelPos) { 
	  return Point(toBlock(pixelPos.x), toBlock(pixelPos.y))
	}
	function forEachBlock(fn) {
		for (var x = 0; x < width; x++) {
			for (var y = 0; y < height; y++) {
				var result = fn(x, y)
				if (result) 
				  return result;
			}
		}           		
  }
	function findMazePos(character) {
    function blockThat(predicate) {
  		return forEachBlock(function(x, y) { 
  		  if (predicate(x, y)) { return new Point(x, y) }
  		})
    }
		return blockThat(function(x, y) { return (data[y][x] == character)})
	}
	var corner = blockCorner(Point(0, 0))
	var bottomRight = blockCorner(Point(width, height)) 
	raphael.rect(corner.x, corner.y, bottomRight.x, bottomRight.y).attr({fill : "#000"})
	forEachBlock(function(x, y) { 
	  var block = Point(x, y) 
	  if (isWall(block)) { 
	    var corner = blockCorner(block)
	    var size = sizeOf(block)
	    raphael.rect(corner.x, corner.y, size.x, size.y)
	      .attr({ stroke : "#808", fill : "#808"})
	}})                            
  
  function accessible(pos, objectRadiusX, objectRadiusY, predicate) {
	  if (!objectRadiusY) objectRadiusY = objectRadiusX
		var radiusX = objectRadiusX 
		var radiusY = objectRadiusY
		for (var x = toBlock(pos.x - radiusX); x <= toBlock(pos.x + radiusX); x++) 
		  for (var y = toBlock(pos.y - radiusY); y <= toBlock(pos.y + radiusY); y++)
		    if (!predicate(Point(x, y))) return false
		return true  
	}
	return {
		playerStartPos : function(player) {
			return blockCenter(findMazePos("" + player.id))
		},      
		playerScorePos : function(player) {
		  var number = Number(player.id) + 4
		  return blockCenter(findMazePos("" + number))
		},
		isAccessible : function(pos, objectRadiusX, objectRadiusY) {
		  return accessible(pos, objectRadiusX, objectRadiusY, function(blockPos) { return !isWall(blockPos) })
		},
		isAccessibleByMonster : function(pos, objectRadiusX, objectRadiusY) {
		  return accessible(pos, objectRadiusX, objectRadiusY, function(blockPos) { return isFree(blockPos) })
		},
		randomFreePos : function(filter) {
		  while(true) {
		    var blockPos = Point(randomInt(width), randomInt(height))
		    var pixelPos = blockCenter(blockPos)
		    if (filter(pixelPos)) return pixelPos
	    }
	  }
	}
}
                              
var delay = 50
var left = Point(-1, 0), right = Point(1, 0), up = Point(0, -1), down = Point(0, 1)
var imgPath = "images/"

function randomInt(limit) { return Math.floor(Math.random() * limit) }
function identity(x) { return x }
function first(xs) { return xs ? xs[0] : undefined}
function latter (_, second) { return second }      
function extractProperty(property) { return function(x) { return x.property } }
Rx.Observable.prototype.CombineWithLatestOf = function(otherStream, combinator) {    
  var mainStream = this
  return Rx.Observable.Create(function(subscriber) {        
    var latest
    var d1 = mainStream.Subscribe(function(mainValue) { 
      subscriber.OnNext(combinator(mainValue, latest)) 
    })
    var d2 = otherStream.Subscribe(function(message) { latest = message})
    return function() {
      d1.Dispose()
      d2.Dispose()
    }
  })
}
Rx.Observable.prototype.SampledBy = function(otherStream) {
  return otherStream.CombineWithLatestOf(this, latter)
}
Rx.Observable.prototype.Multiply = function(times) {
  var result = MessageQueue()                       
  var source = this
  _.range(1, times).forEach(function() { result.plug(source) })
  return result
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
function ticker(interval) {
  return Rx.Observable.Create(function(observer) { 
  	var id = setInterval(observer.OnNext, interval) 
  	return function() { clearInterval(id) }
  })
}
function always(value) { return function(_) { return value } }
function atMostOne(array) { return array.length <= 1 }
function print(x) { console.log(x) }
function toConsole(stream, prefix) { stream.Subscribe( function(item) { console.log(prefix + ":" + item) })}
function Rectangle(x, y, width, height) {
    return {x : x, y : y, width : width, height : height}
}
