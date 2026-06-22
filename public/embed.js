(function () {
  var script = document.currentScript;
  if (!script) return;

  var base = "https://surveys.fanometrix.com";

  var params = new URLSearchParams();
  var attrs = [
    "campaign", "survey", "publisher", "placement",
    "club", "competition", "country", "segment",
  ];
  attrs.forEach(function (attr) {
    var val = script.getAttribute("data-" + attr);
    if (val) params.set(attr, val);
  });

  var iframe = document.createElement("iframe");
  iframe.src = base + "/embed?" + params.toString();
  iframe.width = "300";
  iframe.height = "250";
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("scrolling", "no");
  iframe.style.cssText = "border:0;overflow:hidden;display:block;";
  iframe.title = "Fanometrix Pulse Fan Survey";

  script.parentNode.insertBefore(iframe, script.nextSibling);
})();
