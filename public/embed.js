(function () {
  var script = document.currentScript;
  if (!script) return;

  var base = "https://surveys.fanometrix.com";

  var params = new URLSearchParams();
  var attrs = [
    "campaign", "survey", "publisher", "placement", "placement_id",
    "creative_id", "club", "competition", "country", "segment",
    // A Campaign Group tag names the GROUP rather than one campaign; the group
    // decides which of its campaigns each impression receives. Purely additive:
    // the loop below only sets a parameter when its attribute is present, so a
    // tag without data-campaign-group behaves exactly as it did before.
    "campaign_group",
  ];
  attrs.forEach(function (attr) {
    var val = script.getAttribute("data-" + attr.replace(/_/g, "-"));
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
