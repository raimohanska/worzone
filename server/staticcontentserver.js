var url = require('url'),
    path = require("path"),
    fs = require('fs')

exports.StaticContentServer = function() {
    var handler = function(req, res) {
        // int -> Object -> String -> http.ServerResponse -> Unit
        var serve = function(status, headers, content, response) {
            response.writeHead(status, headers);
            response.write(content);
            response.end();
        }
        var uri = url.parse(req.url).pathname;
        if (uri.length == 0 || uri == "/") uri = "/index.html";
        req.on('end', function() {
            var filename = "." + uri;
            path.exists(filename, function(exists) {
                if (!exists) {
                    serve(404, {"Content-Type": "text/plain"}, "404 Not Found\n", res);
                    return;
                }
                fs.readFile(filename, "binary", function(err, file) {
                    if (err) {
                        serve(500, {"Content-Type": "text/plain"}, err + "\n", res);
                    } else {
                        res.writeHead(200);
                        res.write(file, "binary");
                        res.end();
                    }
                });
            });
        });
    }
    return {requestHandler : handler}
}
