function Point(x, y, cache) {
	return Vector2D(x, y, cache)
}

// Number -> Number -> Vector2D
function Vector2D(x, y, cache) {
	if (cache) {
		cache.x = x
		cache.y = y
		return cache
	}
	return {
		x : x, 
		y : y,
		// Vector2D -> Vector2D
		add : function(other, cache) { return Vector2D(this.x + other.x, this.y + other.y, cache) },
		// Vector2D -> Vector2D
		subtract : function(other, cache) { return this.add(other.invert(cache), cache) },
		// Unit -> Number
		getLength : function() { return Math.sqrt(this.x * this.x + this.y * this.y) },
		// Number -> Vector2D
		times : function(multiplier, cache) { return Vector2D(this.x * multiplier, this.y * multiplier, cache) },
		// Unit -> Vector2D
		invert : function(cache) { return Vector2D(-this.x, -this.y, cache) },
		// Number -> Vector2D
		withLength : function(newLength, cache) { return this.times(newLength / this.getLength(), cache) },
		rotateRad : function(radians, cache) {
			var length = this.getLength()			
			var currentRadians = this.getAngle(cache)
			var resultRadians = radians + currentRadians
			var rotatedUnit = Vector2D(Math.cos(resultRadians), Math.sin(resultRadians), cache)
			return rotatedUnit.withLength(length, cache)			
		},
		// Number -> Vector2D
		rotateDeg : function(degrees, cache) {
			var radians = degrees * 2 * Math.PI / 360
			this.rotateRad(radians, cache)
		},
		// Unit -> Number
		getAngle : function(cache) {
			var length = this.getLength()
			unit = this.withLength(1, cache)
			return Math.atan2(unit.y, unit.x)			
		},   
		floor : function(cache) {
			return Vector2D(Math.floor(this.x), Math.floor(this.y), cache)
		},
		toString : function() {
			return "(" + x + ", " + y + ")"
		}
	}
}