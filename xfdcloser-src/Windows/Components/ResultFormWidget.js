import NoteWidget from "./NoteWidget";
import ResultWidget from "./ResultWidget";
import RationaleWidget from "./RationaleWidget";
import OptionsGroupWidget from "./OptionsGroupWidget";
// <nowiki>

/**
 * @class ResultFormWidget
 * @description Base class for result form, with common elements for the more specifc result form classes.
 * @param {Object} config
 * @param {String} config.sectionHeader Discussion section header
 * @param {Boolean} config.isBasicMode
 * @param {mw.Title[]} config.pages mw.Title objects for each nominated page
 * @param {Object} config.user Object with {String}sig, {string}name, {boolean}isSysop
 * @param {String} config.venue code for venue, e.g. "afd"
 * @param {jQuery} $overlay element for overlays
 */
function ResultFormWidget( config ) {
	// Configuration initialization
	config = config || {};
	// Call parent constructor
	ResultFormWidget.super.call( this, config );

	this.fieldset = new OO.ui.FieldsetLayout();
	this.$element.append( this.fieldset.$element );

	// Top stuff
	this.discussionNote = config.isBasicMode
		? new NoteWidget({
			title: `Discussion: ${config.sectionHeader} (basic mode only)`,
			noteContent: "Nominated pages were not detected."
		})
		: new NoteWidget({
			title: `Discussion: ${config.sectionHeader} (${config.pages.length} ${config.pages.length === 1 ? "page" : "pages"})`,
			noteContent: "<ul>" + config.pages.map(page => "<li>" + page.getPrefixedText() + "</li>").join("") + "</ul>"
		});
	this.fieldset.addItems([
	]);

	// Result - single result
	this.resultWidget = new ResultWidget({
		pages: config.pages,
		venue: config.venue,
		isSysop: config.user.isSysop
	});

	// Result - multiple results

	// Rationale
	this.rationale = new RationaleWidget({});

	// Options
	this.options = new OptionsGroupWidget({
		venue: config.venue,
		isSysop: config.user.isSysop,
		$overlay: config.$overlay
	});
	// Preview


	
	this.fieldset.addItems([
		new OO.ui.FieldLayout( this.discussionNote, {
			//label: 'Notice',
			align:"top"
		} ),
		new OO.ui.FieldLayout( this.resultWidget, {
			label: $("<strong>").text("Result"),
			align:"top"
		} ),
		new OO.ui.FieldLayout( this.rationale, {
			align:"top"
		} ),
		new OO.ui.FieldLayout( this.options, {
			align:"top"
		} )
	]);

	this.resultWidget.connect(this, {"resultSelect": "onResultSelect"});
}
OO.inheritClass( ResultFormWidget, OO.ui.Widget );

ResultFormWidget.prototype.clearAll = () => console.log("ResultFormWidget", "clearAll"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setPreferences = () => console.log("ResultFormWidget", "setPreferences"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setPages = () => console.log("ResultFormWidget", "setPages"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setType = () => console.log("ResultFormWidget", "setType"); //TODO: Replace stub with working function

ResultFormWidget.prototype.onResultSelect = function(resultData) {
	this.options.showOptions(resultData);
};

export default ResultFormWidget;
// </nowiki>