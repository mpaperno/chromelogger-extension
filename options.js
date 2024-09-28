"use strict";
/**
 * Options page scripts.
 * @since 1.5
 */

// message box singleton tracking
var messageTimerId = null;
// the options form
var form = null;


/** Shows a temporary message in the settings form, eg. that the settings were saved. */
function showMessage(message, status = "ok") {
	var msg_el = document.getElementById("message_area");
	msg_el.firstChild?.remove();
	msg_el.appendChild(document.createTextNode(message));
	msg_el.classList.add('visible');
	msg_el.setAttribute('data-status', status);

	if (messageTimerId !== null)
		clearTimeout(messageTimerId);
	messageTimerId = setTimeout(function() {
		messageTimerId = null;
		msg_el.classList.remove('visible');
	}, 5000);
}


/**
 * Populate form from options.
 * @param object opts
 */
function populateForm( opts ) {

	// populate substitution styles ...
	Object.entries(DEFAULT_OPTIONS.console_substitution_styles).forEach(([key, value])=>{
		const input = document.querySelector( 'input#console_substitution_styles-'.concat(key) );
		if ( input ) {
			input.value = opts.console_substitution_styles[key] ?? value;
			input.dispatchEvent(new Event('input')); // trigger change event to update label
		}
	});

	// misc. settings ...
	form.display_data_url.value = opts.display_data_url;
	form.inject_req_headers.checked = opts.inject_req_headers;
	form.inject_req_headers_for_types.value = opts.inject_req_headers_for_types.join(', ');
	form.inject_req_headers_for_types.disabled = !opts.inject_req_headers;
	form.backtrace_position.value = opts.backtrace_position.toString();
	form.timestamp_position.value = opts.timestamp_position.toString();

}

function populateFormFromStorage() {
	browser.storage.sync.get(DEFAULT_OPTIONS)
	.then(populateForm)
	.catch(error=>{ console.error(error); });
}

document.addEventListener("DOMContentLoaded", () => {

	form = document.querySelector("form");

	// style inputs ...
	const console_substitution_style_inputs = form.querySelectorAll("fieldset#console_substitution_styles input");

	// update label style on input update ...
	console_substitution_style_inputs.forEach(input=>{
		input.addEventListener("input", event=>{
			event.target.previousElementSibling.querySelector('label').style = event.target.value;
		});
	});

	// populate form from options ...
	populateFormFromStorage();

	// set change handler on "inject headers" option to en/disable the "request types" option accordingly
	form.inject_req_headers.addEventListener("change", () => {
		form.inject_req_headers_for_types.disabled = !form.inject_req_headers.checked;
	});

	// onsubmit ...
	form.addEventListener("submit", event=>{

		event.preventDefault();

		// reset form to defaults ...
		if ( event.submitter.id == 'reset_defaults' ) {

			populateForm(DEFAULT_OPTIONS);
			showMessage("Default values are shown, but not saved yet.", "warn");
			return;

		}

		// reset form to saved options
		if ( event.submitter.id == 'reset_form' ) {

			populateFormFromStorage();
			showMessage("Form reset to saved option values.");
			return;

		}

		// save ...
		if ( event.submitter.id == 'save' ) {

			// styles collection ...
			let console_substitution_styles = {};

			// update collection ...
			console_substitution_style_inputs.forEach(input=>{
				console_substitution_styles[ input.id.substr( input.id.indexOf('-') + 1 ) ] = input.value.trim();
			});

			// save settings ...
			browser.storage.sync.set({

				// styles ...
				console_substitution_styles: console_substitution_styles,
				// display url log type (''|log|group|groupCollapsed) ...
				display_data_url: form.display_data_url.value,
				// inject request headers and request types list
				inject_req_headers: form.inject_req_headers.checked,
				inject_req_headers_for_types: form.inject_req_headers_for_types.value.split(/\s*,\s*/),
				// backtrace and timestamp position values are numeric
				backtrace_position: parseInt(form.backtrace_position.value),
				timestamp_position: parseInt(form.timestamp_position.value),

			})
			.then(() => showMessage("Options saved!"))
			.catch(error => {
				console.error(error);
				showMessage("Error: " + error.message, "error");
			});

		}

	});


});

