
'use strict';

(function () {

    CKEDITOR.plugins.addExternal('textmatch', 'https://emby.media/support/styles/ckplugins/textmatch/plugin.js');
    CKEDITOR.plugins.addExternal('autocomplete', 'https://emby.media/support/styles/ckplugins/autocomplete/plugin.js');
    CKEDITOR.plugins.addExternal('textwatcher', 'https://emby.media/support/styles/ckplugins/textwatcher/plugin.js');

    let xrefData;
    const maxResults = 50;

    function parseXrefData(yaml, data, urlPrefix, type) {
        const lines = yaml.split('\n');

        let currentData;
        let property = '';
        let value = '';

        function addItem(item) {
            if (item && item.name && Object.keys(item).length > 0) {
                item.id = data.length + 1;
                item.search = item.name.toLowerCase();
                if (item.uid.indexOf('emby.restapi') === 0) {
                    item.type = 'SDK RestAPI';
                }
                data.push(item);
            }
        }

        lines.forEach(line => {
            if (line.startsWith('-')) {
                addItem(currentData);
                currentData = {};
                currentData['type'] = type;
                line = line.substr(1);
            }

            if (currentData) {
                [property, value] = line.trim().split(': ');

                switch (property) {
                    case 'uid':
                    case 'name':
                        currentData[property] = value;
                        break;
                    case 'href':
                        currentData[property] = urlPrefix + value;
                        break;
                    case 'fullName':
                        currentData['name'] = value;
                        break;
                    case 'nameWithType':
                        currentData['name'] = value;
                        currentData['type'] = 'SDK Reference';
                        break;
                }

            }
        });

        addItem(currentData);
    }

    CKEDITOR.plugins.add('embydocs', {
        requires: 'autocomplete,textmatch',

        init: function (editor) {

            editor.on('instanceReady', function () {
                var config = {};

                // Called when the user types in the editor or moves the caret.
                // The range represents the caret position.
                function textTestCallback(range) {
                    // You do not want to autocomplete a non-empty selection.
                    if (!range.collapsed) {
                        return null;
                    }

                    // Use the text match plugin which does the tricky job of performing
                    // a text search in the DOM. The "matchCallback" function should return
                    // a matching fragment of the text.
                    return CKEDITOR.plugins.textMatch.match(range, matchCallback);
                }

                // Returns the position of the matching text.
                // It matches a word starting from the '#' character
                // up to the caret position.
                function matchCallback(text, offset) {
                    // Get the text before the caret.
                    var left = text.slice(0, offset),
                        // Will look for a '#' character followed by a search term
                        match = left.match(/#[a-zA-Z\d-.]*$/);

                    if (!match) {
                        return null;
                    }
                    return {
                        start: match.index,
                        end: offset
                    };
                }

                config.textTestCallback = textTestCallback;

                // Returns (through its callback) the suggestions for the current query.
                function dataCallback(matchInfo, callback) {

                    // Remove the '#' tag.
                    var query = matchInfo.query.substring(1);

                    function simpleSearch(searchStr) {
                        if (searchStr.length === 0) {
                            let suggestions1 = [];
                            for (let i = 0; i < maxResults && i < xrefData.length; i++) {
                                suggestions1.push(xrefData[i]);
                            }
                            callback(suggestions1);
                            return;
                        }

                        let suggestions = [];
                        for (let i = 0; i < xrefData.length && suggestions.length < maxResults; i++) {
                            if (String(xrefData[i].search).indexOf(searchStr.toLowerCase()) !== -1) {
                                suggestions.push(xrefData[i]);
                            }
                        }
                        callback(suggestions);
                    }


                    if (xrefData) {

                        simpleSearch(query);
                        return;
                    }

                    fetch('https://emby.media/support/xrefmap.yml')
                        .then(response => response.text())
                        .then(yaml => {

                            xrefData = [];

                            parseXrefData(yaml, xrefData, 'https://emby.media/support/', 'Documentation');

                            fetch('https://dev.emby.media/xrefmap.yml')
                                .then(response => response.text())
                                .then(yaml => {

                                    parseXrefData(yaml, xrefData, 'https://dev.emby.media/', 'SDK Documentation');

                                    simpleSearch(query);
                                })
                                .catch(error => {
                                    console.error(error);
                                });

                        })
                        .catch(error => {
                            console.error(error);
                        });


                }

                config.dataCallback = dataCallback;

                // Define the templates of the autocomplete suggestions dropdown and output text.
                config.itemTemplate = '<li data-id="{id}">{type}: {name}</li>';
                config.outputTemplate = '<a href="{href}">Emby {type}: {name}</a> ';

                // Attach autocomplete to the editor.
                new CKEDITOR.plugins.autocomplete(editor, config);
            });
        }
    });

})();