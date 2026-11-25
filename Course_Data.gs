function handleCourseDataPost_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("ERROR: No data received");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Course Listed");
    if (!sheet) {
      return ContentService.createTextOutput("ERROR: Course Listed sheet not found");
    }

    const data = JSON.parse(e.postData.contents);

    function cleanHTML(text) {
      if (!text) return "";
      return text.toString()
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#038;/g, "&")
        .trim();
    }

    function getMeta(key) {
      const meta = data.post_meta || {};
      const value = meta[key] || meta["_" + key] || meta["post_meta_" + key] || "";
      return Array.isArray(value) ? value[0] : value;
    }

    function getTaxonomy(taxonomy) {
      if (!data.taxonomies || !data.taxonomies[taxonomy]) return "";
      const items = data.taxonomies[taxonomy];
      for (const key in items) {
        if (items[key] && items[key].name) return items[key].name;
      }
      return "";
    }

    function getAllTaxonomyNames(taxonomy) {
      if (!data.taxonomies || !data.taxonomies[taxonomy]) return "";
      const items = data.taxonomies[taxonomy];
      const names = [];
      for (const key in items) {
        if (items[key] && items[key].name) names.push(items[key].name);
      }
      return names.join(", ");
    }

    const post = data.post || {};
    const row = [
      new Date(),
      cleanHTML(post.post_title),
      getTaxonomy("provider"),
      getTaxonomy("institution"),
      getTaxonomy("language"),
      getTaxonomy("price"),
      getTaxonomy("duration"),
      getTaxonomy("level"),
      getTaxonomy("subject"),
      getTaxonomy("collection"),
      getAllTaxonomyNames("topics"),
      cleanHTML(getMeta("course_duration")),
      getMeta("rating_5"),
      getMeta("total_enrollments"),
      getMeta("total_reviews"),
      cleanHTML(getMeta("instructor_name")),
      getMeta("Certificate"),
      getMeta("demand"),
      getMeta("resources"),
      getMeta("support"),
      getMeta("Lessons"),
      getMeta("Modules"),
      getMeta("Platform_Money_Back_guarantee"),
      getMeta("course_access_duration"),
      data.post_permalink || "",
      getMeta("affiliate"),
      data.post_thumbnail || "",
      cleanHTML(post.post_excerpt),
      data.post_id || "",
      "TRUE"
    ];

    if (row.length !== 30) throw new Error("Course Listed row must contain 30 columns");
    sheet.appendRow(row);
    return ContentService.createTextOutput("SUCCESS: Row " + sheet.getLastRow() + " added");
  } catch (error) {
    Logger.log("Course data error: " + error.toString());
    return ContentService.createTextOutput("ERROR: " + error.toString());
  }
}
