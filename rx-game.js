$(function() {
  // graphics setup
  var bounds = Rectangle(0, 0, 800, 600)
  var r = Raphael(10, 10, bounds.width, bounds.height);
  r.rect(bounds.x, bounds.y, bounds.width, bounds.height).attr({fill : "#000"})
  var maze = Maze(r, 40)
  var messageQueue = MessageQueue()
  
  // streams
  var player1 = Player(1, KeyMap([[38, up], [40, down], [37, left], [39, right]], 18))
  var man1 = Man(player1, maze, messageQueue, r)

  var player2 = Player(2, KeyMap([[87, up], [83, down], [65, left], [68, right]], 70))
  var man2 = Man(player2, maze, messageQueue, r)                             

  var targets = Targets([man1, man2], messageQueue)

  messageQueue.ofType("fire").Subscribe(function(state) { 
	Bullet(state.pos, state.dir, maze, targets, messageQueue, r) 
  })                    
  
  messageQueue.ofType("hit").Subscribe(function(hit) {
	// TODO: re-instantiate player here
	var hitTarget = targets.byId(hit.id)
	var player = hitTarget.player
  }) 

  console.log('started')
})                               

function KeyMap(directionKeyMap, fireKey) {
	return {
		directionKeyMap : directionKeyMap,
		fireKey : fireKey
	}
}

function Player(id, keyMap) {
	return {
		id : id,
		keyMap : keyMap
	}
}

function Targets(targets, messageQueue) {     
	messageQueue.ofType("hit").Subscribe(function(hit) {
		targets = _.select(targets, function(target) { return target.id != hit.id})
	})
	return {
		hit : function(pos) { return first(_.select(targets, function(target) { if (target.hit(pos)) return target }))},
		byId : function(id) { return _.select(targets, function(target) { return first(target.id == id) })}
	}
}          

function LatestValueHolder(stream) {
	var value
	stream.Subscribe(function(newValue) { value = newValue})
	return { value : function() { return value }}
}

function Bullet(startPos, velocity, maze, targets, messageQueue, r) {      
	var radius = 3
	var bullet = r.circle(startPos.x, startPos.y, radius).attr({fill: "#f00"})
	var movements = ticker.Select(function(_) {return velocity})
	var unlimitedPosition = movements
		.Scan(startPos, function(pos, move) { return pos.add(move.times(20)) })
	var collision = unlimitedPosition.Where(function(pos) { return !maze.isAccessible(pos, radius, radius) }).Take(1)   
	var hit = unlimitedPosition.Where(function(pos) { return targets.hit(pos) }).Select(function(pos) {
		return { message : "hit", target : targets.hit(pos).id}
	})
	var hitOrCollision = collision.Merge(hit)
	var position = unlimitedPosition.TakeUntil(hitOrCollision)
	
    position.Subscribe(function (pos) { bullet.animate({cx : pos.x, cy : pos.y}, delay) })
    hitOrCollision.Subscribe(function(pos) { bullet.remove() }) 
	messageQueue.plug(hit)
}      

function Man(player, maze, messageQueue, r) {
  var keyMap = player.keyMap.directionKeyMap
  var fireKey = player.keyMap.fireKey
  var startPos = maze.playerStartPos(player)
  var radius = 20      
  var man = r.image("man-left-1.png", startPos.x - radius, startPos.y - radius, radius * 2, radius * 2)
  var hit = messageQueue.ofType("hit").Where(function(hit) {   
	return hit.target == man.id
  }).Take(1)
  var direction = Keyboard().multiKeyState(keyMap).Where(atMostOne).Select(first).TakeUntil(hit)  
  var latestDirection = direction.Where(identity).StartWith(left)
  var movements = ticker.CombineLatest(direction, latter).Where(identity)
  var position = movements.Scan(startPos, function(pos, move) { 
	var nextPos = pos.add(move.times(4))         
	if (!maze.isAccessible(nextPos, radius, radius)) return pos
	return nextPos }).StartWith(startPos)
  var animation = movements.BufferWithCount(2).Scan(1, function(prev, _) { return prev % 2 + 1}).TakeUntil(hit)
  position.Subscribe(function (pos) { man.attr({x : pos.x - radius, y : pos.y - radius}) })
  var animAndDir = latestDirection.CombineLatest(animation, function(dir, anim) { return {anim : anim, dir : dir}})
  animAndDir.Subscribe(function(state) {
	var angle, basename
	if (state.dir == left) {
		basename = "man-left-"
		angle = 0
	} else {
		basename = "man-right-"
		angle = state.dir.getAngle() * 360 / (2 * Math.PI)
	}
	man.rotate(angle, true)
	man.attr({src : basename + (state.anim) + ".png"})
  })               
  hit.Subscribe(function() {     
	man.attr({src : "explosion.png"})
  })                            

  var status = position.CombineLatest(latestDirection, function(pos, dir) {
	return { message : "move", object : man, pos : pos, dir : dir }
  })         

  var fire = combineWithLatestOf(Keyboard().keyDowns(fireKey), status, function(_, status) { 
	return {message : "fire", pos : status.pos.add(status.dir.withLength(radius + 5)), dir : status.dir} 
  }).TakeUntil(hit)
  
  messageQueue.plug(status)
  messageQueue.plug(fire)        
  var currentPos = LatestValueHolder(position)
  man.hit = function(pos) { return currentPos.value().subtract(pos).getLength() < radius }
  return man                                                          
}

function Keyboard() {
	var allKeyUps = $(document).toObservable("keyup")
	var allKeyDowns = $(document).toObservable("keydown")
	//allKeyDowns.Subscribe(function(event) {console.log(event.keyCode)})
	function keyCodeIs(keyCode) { return function(event) { return event.keyCode == keyCode} }
	function keyUps(keyCode) { return allKeyUps.Where(keyCodeIs(keyCode)) }
	function keyDowns(keyCode) { return allKeyDowns.Where(keyCodeIs(keyCode)) }
	function keyState(keyCode, value) { 		
		return Rx.Observable.FromArray([[]]).Merge(keyDowns(keyCode).Select(always([value]))
			.Merge(keyUps(keyCode).Select(always([]))).DistinctUntilChanged())
	}
	function multiKeyState(keyMap) {
		var streams = keyMap.map(function(pair) { return keyState(pair[0], pair[1]) })
		return combineLatestAsArray(streams)
	}	
	return {
		multiKeyState : multiKeyState,
		keyDowns : keyDowns
	}	
}

function MessageQueue() {
    var observers = []
    var asObservable =  Rx.Observable.Create(function(observer) { 
        observers.push(observer)
		return function() { observers.splice(observers.indexOf(observer), 1)}
    })
    function push(message) {  	
        observers.forEach(function(observer) {
            observer.OnNext(message)
        });
    }
    function plug(observable) {
        observable.Subscribe(push)
    }
        
    return {
        toObservable : function() { return asObservable },
		ofType : function(messageType) { return asObservable.Where(function(message) { return message.message == messageType})},
        push : push,
        plug : plug
    }
}

function Maze(raphael, blockSize) {
	var data 
	  = "********************\n"
	  + "*                  *\n"
	  + "* *******  ******* *\n"
	  + "* *              * *\n"
	  + "* *    ******    * *\n"
	  + "* *    *    *    * *\n"
	  + "*                  *\n"
	  + "* *              * *\n"
	  + "* *    ******    * *\n"
	  + "* *              * *\n"
	  + "* *              * *\n"
	  + "* *******  ******* *\n"
	  + "*                  *\n"
	  + "*1****************2*\n"
	  + "***              ***\n"
	data = data.split("\n");
	var width = data[0].length
	var height = data.length
	function charAt(blockPos) {
		return data[blockPos.y][blockPos.x]
	}
	function isWall(blockPos) { return charAt(blockPos) == "*" }
	function toPixels(blockPos) { return blockPos.times(blockSize).add(Point(blockSize / 2, blockSize / 2))}
	function toBlocks(pixelPos) { return pixelPos.times(1 / blockSize).floor()}
	function findMazePos(character) {
		for (var x = 0; x < width; x++) {
			for (var y = 0; y < height; y++) {
				if (data[y][x] == character) {
					return new Point(x, y)
				}
			}
		}           		
	}
	for (var x = 0; x < width; x++) {
		for (var y = 0; y < height; y++) {
			if (isWall(Point(x, y))) {
				raphael.rect(x * blockSize, y * blockSize, blockSize, blockSize).attr({ fill : "#808"})
			}
		}
	}           
	return {
		playerStartPos : function(player) {
			return toPixels(findMazePos("" + player.id))
		},
		isAccessible : function(pos, objectRadiusX, objectRadiusY) {
			var radiusX = objectRadiusX - 1
			var radiusY = objectRadiusY - 1
			return !isWall(toBlocks(pos.add(Point(-radiusX, -radiusY)))) && !isWall(toBlocks(pos.add(Point(radiusX, radiusY))))
				&& !isWall(toBlocks(pos.add(Point(radiusX, -radiusY)))) && !isWall(toBlocks(pos.add(Point(-radiusX, radiusY))))         
		}
	}
}
                              
var delay = 50
var left = Point(-1, 0), right = Point(1, 0), up = Point(0, -1), down = Point(0, 1)
function identity(x) { return x }
function first(xs) { return xs ? xs[0] : undefined}
function latter (_, second) { return second }      
function combineWithLatestOf(mainStream, additional, combinator) {
	var latest
	additional.Subscribe(function(value) { latest = value })
	return mainStream.Select(function(mainValue) { return combinator(mainValue, latest) } )
}                   
function combineWith(streams, combinator) {
	var stream = streams[0]
	for (var i = 1; i < streams.length; i++) {
		stream = combinator(stream, streams[i])
	}
	return stream;	
}                                                                    
function toArray(x) { return !x ? [] : (Array.isArray(x) ? x : [x])}
function concatArrays(a1, a2) { return toArray(a1).concat(toArray(a2)) }
function combineLatestAsArray(streams) {   
	return combineWith(streams, function(s1, s2) { return s1.CombineLatest(s2, concatArrays)})  
}
var ticker = Rx.Observable.Create(function(observer) { 
	var id = setInterval(observer.OnNext, delay) 
	return function() { clearInterval(id) }
})
function always(value) { return function(_) { return value } }
function atMostOne(array) { return array.length <= 1 }
function print(x) { console.log(x) }
function toConsole(stream) { stream.Subscribe(print)}
function Rectangle(x, y, width, height) {
    return {x : x, y : y, width : width, height : height}
}
