import config from "./config";
import API from "./api";
import { 
	dateFromSigTimestamp,
	setExistence,
	arrayFromResponsePages,
	pageFromResponse,
	multiButtonConfirm,
	dmyDateString
} from "./util";
import windowManager from "./windowManager";
const Dialog = () => {}; // TODO: replace this stub with an import of an actual class
Dialog.prototype.setup = () => console.log("Dialog setup function");
const InputData = () => {}; // TODO: replace this stub with an import of an actual class
const TaskManager = () => {}; // TODO: replace this stub with an import of an actual class
TaskManager.prototype.start = () => console.log("TaskManager setup function");

// <nowiki>

/* ========== Discusssion class =================================================================
   Each instance represents an XfD discussion.                          
   ---------------------------------------------------------------------------------------------- */
/** Constructor
 * @param {Object} discussionConfig configuration object:
 *   @config {String} id - A unique ID for this discussion (used in various elements' IDs)
 *   @config {String} nomPage - Page where the XFD discussion is taking place; either a dated or
 *           name-based subpage
 *   @config {String} sectionHeader - text of the section heading for the XFD discussion
 *   @config {String} sectionNumber - edit section number for the XFD discussion
 *   @config {mw.Title[]} pages - pages nominated in the XFD discussion; omit if in basic mode
 *   @config {String} firstDate - first timestamp date, for RFD discussions
 *   @config {Boolean} isOld - `true` if discussion has been listed (or relisted) for more than 7 days
 *   @config {Boolean} isRelisted - `true` if discussion has been relisted   
 * 
 */
var Discussion = function(discussionConfig) {
	var defaultConfig = {
		pages: [],
		deferred: {} // For later tracking of jQuery Deferred objects
	};
	$.extend(this, defaultConfig, discussionConfig);
	this.windowManager = windowManager;
};

// Construct from headline span element
Discussion.newFromHeadlineSpan = function (headingIndex, context) {
	var $headlineSpan = $(context);
	var $heading = $headlineSpan.parent();
	var $statusContainer = config.isMobileSite ? $heading.next() : $heading;
	
	// Fix for "Auto-number headings" preference
	$(".mw-headline-number", context).prependTo($heading);

	// Get section header
	var sectionHeader = $headlineSpan.text().trim();

	// Check if already closed. Closed AfDs and MfDs have the box above the heading.
	if ( /(afd|mfd)/.test(config.venue.type) && $heading.parent().attr("class") && $heading.parent().attr("class").includes("xfd-closed") ) {
		// Skip 
		return;
	} else if ( !/(afd|mfd)/.test(config.venue.type) && $heading.next().attr("class") ) {
		// Only for closed discussion will the next element after the heading have any class set
		// Skip, add class to enable hiding of closed discussions
		$heading.addClass("xfd-closed");
		return;
	}

	var sectionlink = $heading.find(".mw-editsection a")
		.not(".mw-editsection-visualeditor, .autoCloserButton").attr("href");
	if (!sectionlink) {
		// Try to find a section link generated by Module:XfD_old.
		sectionlink = $heading.next().find(".xfdOldSectionEdit > a").attr("href");
		if (!sectionlink) {
			// XFDcloser can't work without knowing the nompage and section number, so skip this section.
			return;
		}
		// Add a "T-" so the next check will see this as a transcluded section
		sectionlink = sectionlink.replace("section=", "section=T-");
	}
	var editsection = sectionlink.split("section=")[1].split("&")[0];
	var nompage = "";
	if ( /T/.test(editsection) ) {
		// Section is transcluded from another page
		nompage = mw.Title.newFromText(
			decodeURIComponent(sectionlink.split("title=")[1].split("&")[0])
		).getPrefixedText();
		if ( -1 !== $.inArray(nompage, [
			"Wikipedia:Redirects for discussion/Header",
			"Wikipedia:Redirect/Deletion reasons",
			"Wikipedia:Templates for discussion/Holding cell",
			"Wikipedia:Categories for discussion/Speedy"
		])
		) {
			// ignore headings transcuded from these pages
			return;
		}
		// remove "T-" from section number
		editsection = editsection.substr(2);
	} else {
		// Section is on current page, not transcluded
		if ( config.venue.transcludedOnly ) {
			return;
		}
		nompage = mw.Title.newFromText( config.mw.wgPageName ).getPrefixedText();		
	}

	var pages=[];
	var firstDate;

	if ( config.venue.type === "cfd" ) {
		//CFDs: Nominates pages are the first link of an <li> item in a <ul> list, within a <dl> list
		pages = $heading
			.nextUntil(config.venue.html.head + ", div.xfd-closed")
			.find("dd > ul > li")
			.has("b:first-child:contains(\"Propose \")")
			.find("a:first-of-type")
			.not(".external")
			.map(function() { return mw.Title.newFromText($(this).text()); })
			.get();
		if ( pages.length === 0 ) {
			// Sometimes nominated pages are instead just in a <ul> list, e.g.
			// Wikipedia:Categories_for_discussion/Log/2019_February_5#Foo_in_fiction
			pages = $heading
				.next("ul")
				.find("li")
				.find("a:first-of-type")
				.not(".external")
				.map(function() { return mw.Title.newFromText($(this).text()); })
				.get();
		}
	} else if ( config.venue.type === "rfd" || config.venue.type === "mfd" ) {
		// For MFD, closed discussion are within a collapsed table
		$("table.collapsible").has("div.xfd-closed").addClass("xfd-closed");
		// MFD & RFD have nominated page links prior to span with classes plainlinks, lx
		pages = $heading
			.nextUntil(config.venue.html.head + ", div.xfd-closed, table.xfd-closed")
			.find(config.venue.html.listitem)
			.has("span.plainlinks.lx")
			.children("span")
			.filter(":first-child")
			.children("a, span.plainlinks:not(.lx)")
			.filter(":first-child")
			.map(function() { return mw.Title.newFromText($(this).text()); })
			.get();
		if ( config.venue.type === "rfd" ) {
			var discussionNodes = $heading
				.nextUntil(config.venue.html.head + ", div.xfd-closed, table.xfd-closed")
				.clone();
			
			// Fix for "Comments in Local Time" gadget
			discussionNodes.find("span.localcomments").each(function(){
				var utcTime = $(this).attr("title");
				$(this).text(utcTime);
			});
			
			var discussionText = discussionNodes.text();
			// Ignore relisted discussions, and non-boxed closed discussions
			if (
				discussionText.includes("Relisted, see Wikipedia:Redirects for discussion") ||
				discussionText.includes("Closed discussion, see full discussion")
			) {
				return;
			}
			// Find first timestamp date
			var firstDatePatt = /(?:\d\d:\d\d, )(\d{1,2} \w+ \d{4})(?: \(UTC\))/;
			var firstDateMatch = firstDatePatt.exec(discussionText);
			firstDate = firstDateMatch && firstDateMatch[1];
		}
	} else {
		// AFD, FFD, TFD: nominated page links inside span with classes plainlinks, nourlexpansion
		pages = $heading
			.nextUntil(config.venue.html.head + ", div.xfd-closed")
			.find(config.venue.html.listitem + " > span.plainlinks.nourlexpansion")
			.filter(":nth-of-type(" + config.venue.html.nthSpan + ")")
			.children("a")
			.filter(":first-child")
			.map(function() { return mw.Title.newFromText($(this).text()); })
			.get();
	}
	
	// Sanity check - check if any pages are null
	if ( !pages || pages.length === 0 || pages.some(function(p) { return !p; }) ) {
		//Still offer a "basic" close using the section header
		pages = false;
	}

	// Check discussion age (since last relist, if applicable)
	// TODO: reduce redundancy with finding RfDs' first date
	var isOld;
	var $discussionNodes = $heading
		.nextUntil(config.venue.html.head + ", div.xfd-closed, table.xfd-closed")
		.clone()
		.find("span.localcomments")
		.each(function(){
			var utcTime = $(this).attr("title");
			$(this).text(utcTime);
		})
		.end();
	var lastRelist = $("<div>").append($discussionNodes).find(".xfd_relist").last().text();
	if ( lastRelist ) {
		$statusContainer.addClass("xfdc-relisted");
	}
	var notTranscludedCorrectlyPatt = /(?:Automated|Procedural) (?:comment|Note).*transcluded.*/i;
	var notTranscludedCorrectlyMatch = $discussionNodes.text().match(notTranscludedCorrectlyPatt);
	var notTranscludedCorrectlyComment = notTranscludedCorrectlyMatch && notTranscludedCorrectlyMatch[0];

	var timestampPatt = /\d\d:\d\d, \d{1,2} \w+ \d{4} \(UTC\)/;
	var listingTimestampMatch = lastRelist.match(timestampPatt) ||
		notTranscludedCorrectlyComment && notTranscludedCorrectlyComment.match(timestampPatt) ||
		$discussionNodes.text().match(timestampPatt);
	var listingTimestampDate = listingTimestampMatch && dateFromSigTimestamp(listingTimestampMatch[0]);
	if ( !listingTimestampDate ) {
		$statusContainer.addClass("xfdc-unknownAge");
	} else {
		var millisecondsSinceListing = new Date() - listingTimestampDate;
		var discussionRuntimeDays = 7;
		var discussionRuntimeMilliseconds = discussionRuntimeDays * 24 * 60 * 60 * 1000;
		isOld = millisecondsSinceListing > discussionRuntimeMilliseconds;
		$statusContainer.addClass((isOld ? "xfdc-old" : "xfdc-notOld"));
	}

	// Create status span and notices div with unique id based on headingIndex
	var uniqueID = "XFDC" + headingIndex;
	var $statusSpan = $("<span>")
		.attr({"id":uniqueID, "class":"xfdc-status"})
		.text("[XFDcloser loading...]");
	var $noticesDiv = $("<div>").attr({"id":uniqueID+"-notices", "class":"xfdc-notices"});
	if (config.isMobileSite) {
		$heading.next().prepend( $statusSpan, $noticesDiv );
	} else {
		$headlineSpan.after( $statusSpan );
		$heading.after($noticesDiv);
	}
	
	// Create discussion object
	return new Discussion({
		"id": uniqueID,
		"nomPage": nompage,
		"sectionHeader": sectionHeader,
		"sectionNumber": editsection,
		"pages": pages || [],
		"firstDate": firstDate || null,
		"isOld": !!isOld,
		"isRelisted": !!lastRelist
	});
};

// ---------- Discusssion prototype ------------------------------------------------------------- */

/**
 * Get status element
 * @returns {jQuery}
 */
Discussion.prototype.get$status = function() {
	return $("#"+this.id);
};
/**
 * Set status
 * @param {String|jQuery} $status
 */
Discussion.prototype.setStatus = function($status) {
	this.get$status().empty().append($status);
};
/**
 * Open dialog
 * 
 * @param {Boolean} isRelisting open in relisting mode
 * @returns {Boolean} True if dialog was opened, false if another dialog is already open
 */
Discussion.prototype.openDialog = function(isRelisting) {
	// let currentWindow = windowManager.getCurrentWindow();
	// if (currentWindow && ( currentWindow.isOpened() || currentWindow.isOpening() ) ) {
	// 	// Another dialog window is already open
	// 	return false;
	// }
	windowManager.openWindow("main", {
		discussion: this,
		venue: config.venue,
		user: config.user,
		type: isRelisting ? "relist" : "close"
	}).closed.then(winData => {
		if (!winData || !winData.success) {
			this.showLinks();
		}
		console.log("success", winData);
	});

	return true;
};
// Mark as finished
Discussion.prototype.setFinished = function(aborted) {
	var self = this;
	var msg;
	
	if ( aborted != null ) {
		msg = [
			$("<strong>").text( ( self.dialog && self.dialog.relisting ) ? "Aborted relist" : "Aborted close" ),
			( aborted === "" ) ? "" : ": " + aborted
		];		
	} else if ( self.dialog && self.dialog.relisting ) {
		msg = [
			"Discussion ",
			$("<strong>").text("relisted"),
			" (reload page to see the actual relist)"
		];
	} else {
		msg = [
			"Closed as ",
			$("<strong>").text(self.taskManager.inputData.getResult()),
			" (reload page to see the actual close)"
		];
	}
	self.setStatus(msg);
	self.get$status().prev().css("text-decoration", "line-through");
};
// Get notices element (jQuery object)
Discussion.prototype.get$notices = function() {
	return $("#"+this.id+"-notices");
};
// Set notices element
Discussion.prototype.setNotices = function($content) {
	this.get$notices().empty().append($content);
};
// Get an array of page titles
Discussion.prototype.getPageTitles = function(pagearray, options) {
	var titles = (pagearray || this.pages).map(function(p) { 
		return p.getPrefixedText();
	});
	if ( options && options.moduledocs ) {
		return titles.map(function(t) {
			var isModule = ( t.indexOf("Module:") === 0 );
			return ( isModule ) ? t + "/doc" : t;
		});
	}
	return titles;
};
// Get an array of page' talkpage titles (excluding pages which are themselves talkpages)
Discussion.prototype.getTalkTitles = function(pagearray) {
	return (pagearray || this.pages).map(function(p) { 
		return p.getTalkPage().getPrefixedText();
	}).filter(function(t) { return t !== ""; });
};
// Get link text for a wikiink to the discussion - including anchor, except for AfDs/MfDs 
Discussion.prototype.getNomPageLink = function() {
	if (config.venue.type === "afd" || config.venue.type === "mfd") {
		return this.nomPage;
	} else {
		return this.nomPage + "#" + mw.util.wikiUrlencode(this.sectionHeader).replace(/_/g, " ");
	}
};
// Get nomination subpage
Discussion.prototype.getNomSubpage = function() {
	return this.nomPage.replace(config.venue.subpagePath, "");
};
// Get page object by matching the title
Discussion.prototype.getPageByTitle = function(title, options) {
	var convertModuleDoc = ( options && options.moduledocs && title.indexOf("Module:") === 0 );
	var titleToCheck = ( convertModuleDoc ) ? title.replace(/\/doc$/,"") : title;

	var search = mw.Title.newFromText(titleToCheck).getPrefixedText();
	for ( var i=0; i<this.pages.length; i++ ) {
		if ( search === this.pages[i].getPrefixedText() ) {
			return this.pages[i];
		}
	}
	return false;
};
// Get page object by matching the talkpage's title
Discussion.prototype.getPageByTalkTitle = function(t) {
	var search = mw.Title.newFromText(t).getPrefixedText();
	for ( var i=0; i<this.pages.length; i++ ) {
		if ( search === this.pages[i].getTalkPage().getPrefixedText() ) {
			return this.pages[i];
		}
	}
	return false;
};

// Show links for closing/relisting
Discussion.prototype.showLinks = function(additonal) {
	// Preserve reference to self object
	var self = this;
	
	// Close link
	var $close = $("<span>")
		.addClass("xfdc-action")
		.append(
			"[",
			$("<a>")
				.attr("title", "Close discussion...")
				.text("Close"),
			"]"
		)
		.click(function() {
			return self.openDialog() && self.setStatus("Closing...");
		});
	
	// Relist link
	var $relist = $("<span>")
		.addClass("xfdc-action")
		.append(
			"[",
			$("<a>")
				.attr({title:"Relist discussion...", class:"XFDcloser-link-relist"})
				.text("Relist"),
			"]"
		)
		.click(function() {
			return self.openDialog(true) && self.setStatus("Relisting...");
		});
	
	// quickKeep
	var $qk = $("<a>")
		.attr("title", "quickKeep: close as \"keep\", remove nomination templates, "+
		"add old xfd templates to talk pages")
		.text("qK")
		.click(function(){
			var inputData = new InputData(self);
			inputData.result = "keep";
			inputData.after = "doKeepActions";
		
			self.setStatus("Closing...");
			self.taskManager = new TaskManager(self, inputData);
			self.taskManager.start();
		});

	// quickDelete
	var $qd = ( !config.user.isSysop && config.venue.type !== "tfd" ) ? "" : $("<a>")
		.attr({
			"title": "quickDelete: close as \"delete\", delete nominated pages & their talk pages"+
			(( config.venue.type === "rfd" ) ? "" :" & redirects")+
			(( config.venue.type === "afd" || config.venue.type === "ffd" ) ? ", optionally "+
				"unlink backlinks" : ""),
			"class": "xfdc-qd"
		})
		.text("qD");
	if ( !config.user.isSysop && config.venue.type == "tfd" ) {
		$qd.attr("title", "quickDelete: close as \"delete\", tag nominated templates with "+
			"{{being deleted}}, add nominated templates to the holding cell as \"orphan\"")
			.click(function(){
				var inputData = new InputData(self);
				inputData.result = "delete";
				inputData.after = "holdingCell";
				inputData.holdcell = "orphan";
				inputData.dontdeletetalk = true;
			
				self.setStatus("Closing...");
				self.taskManager = new TaskManager(self, inputData);
				self.taskManager.start();
			});
	} else if ( config.user.isSysop ) {
		$qd.click(function(){
			$.when(config.venue.type === "tfd" ?
				multiButtonConfirm({
					title: "Really delete?",
					message: "Deletion will not remove transclusions from articles. Do you want to use the holding cell instead?",
					actions: [
						{ label: "Cancel", flags: "safe" },
						{ label: "Delete", flags: "destructive", action: "delete" },
						{ label: "Holding cell", flags: "progressive", action: "holdcell" }
					],
					size: "medium"
				}) :
				"delete"
			)
				.then(function(action) {
					var inputData = new InputData(self);
					inputData.result = "delete";
					if ( action === "delete" ) {
						inputData.after = "doDeleteActions";
						inputData.deleteredir = ( config.venue.type === "rfd" ) ? null : true;
						inputData.unlinkbackl = ( config.venue.type === "afd" || config.venue.type === "ffd" ) ? true : null;
					} else if ( action === "holdcell" ) {
						inputData.after = "holdingCell";
						inputData.holdcell = "orphan";
						inputData.dontdeletetalk = true;
					} else {
					// User selected Cancel
						return;
					}
					self.setStatus("Closing...");
					self.taskManager = new TaskManager(self, inputData);
					self.taskManager.start();
				});
		});
	}
	
	// quickClose links
	var $quick = $("<span>")
		.addClass("xfdc-action")
		.css("font-size", "92%")
		.append(
			"[",
			$("<a>")
				.attr("title", "quickClose discussion...")
				.text("quickClose")
				.click(function(){
					$(this).hide().next().show();
				}),
			$("<span>")
				.hide()
				.append(
					"&nbsp;",
					$qk,
					" ",
					$("<strong>").html("&middot;"),
					" ",
					$qd,
					"&nbsp;",
					$("<span>")
						.attr({title: "Cancel", class: "xfdc-qc-cancel"})
						.html("&nbsp;x&nbsp;")
						.click(function(){
							$(this).parent().hide().prev().show();
						})
				),
			"]"
		);


	//Add links in place of status
	self.setStatus([
		$close,
		( self.isBasicMode() || config.venue.type==="cfd" ) ? "" : $quick,
		$relist,
		additonal || ""
	]);
};
	
// Retrieve extra information - pages' existance, nomination date(s)
Discussion.prototype.retrieveExtraInfo = function() {
	// Preserve reference to discussion object
	var self = this;
	
	var pagesExistencesPromise = API.get( {
		action: "query",
		titles: self.getPageTitles().join("|"),
		prop: "info",
		inprop: "talkid"
	} )
		.then(arrayFromResponsePages)
		.then(function(pages) {
			pages.forEach(function(page) {
				var pageObject = self.getPageByTitle(page.title);
				if ( !pageObject ) {
					return $.Deferred().reject("Unexpacted title `"+page.title+"`");
				}
				var pageExists = page.pageid > 0;
				var talkExists = page.talkid > 0;
				setExistence(pageObject, pageExists);
				setExistence(pageObject.getTalkPage(), talkExists);
			});
			return true;
		});
		
	var nominationDatePromise = ( config.venue.type !== "afd" && config.venue.type !== "mfd" )
		? $.Deferred().resolve(self.nomPage.split(config.venue.path)[1])
		: API.get({
			action: "query",
			titles: self.nomPage,
			prop: "revisions",
			rvprop: "timestamp",
			rvdir: "newer",
			rvlimit: "1"
		})
			.then(pageFromResponse)
			.then(function(page) {
				var revisionDate = new Date(page.revisions[0].timestamp);
				return dmyDateString(revisionDate);
			});
	
	nominationDatePromise.then(function(nomDate) {
		self.nomDate = nomDate;
		// For an RfD with no first comment date detected, use the nom page date in dmy format
		if ( config.venue.type === "rfd" && !self.firstDate ) {
			self.firstDate = nomDate.replace(/(\d+) (\w*) (\d+)/g, "$3 $2 $1");
		}
	});
	
	return $.when(pagesExistencesPromise, nominationDatePromise).then(
		function(){ return ""; },
		function(failMessage, jqxhr) {
			return $("<span>").addClass("xfdc-notice-error").append(
				"Error retrieving page information (reload the page to try again) ",
				$("<span>").addClass("xfdc-notice-error").append(
					extraJs.makeErrorMsg(failMessage, jqxhr)
				)
			);
		}
	);
};

// Check if discussion is in 'basic' mode - i.e. no pages
Discussion.prototype.isBasicMode = function() {
	return !this.pages || this.pages.length === 0;
};

export default Discussion;
// </nowiki>