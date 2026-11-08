
'use strict';

(function () {

    CKEDITOR.plugins.addExternal('textmatch', 'https://emby.media/support/styles/ckplugins/textmatch/plugin.js');
    CKEDITOR.plugins.addExternal('autocomplete', 'https://emby.media/support/styles/ckplugins/autocomplete/plugin.js');
    CKEDITOR.plugins.addExternal('textwatcher', 'https://emby.media/support/styles/ckplugins/textwatcher/plugin.js');

    const maxResults = 50;

    // '##' selects the first source, each additional '#' the next one
    const sources = [
        {
            title: 'Emby Docs',
            url: 'https://emby.media/support/xrefmap.yml',
            urlPrefix: 'https://emby.media/support/',
            type: 'Documentation'
        },
        {
            title: 'Emby Learn',
            url: 'https://emby.media/learn/xrefmap.yml',
            urlPrefix: 'https://emby.media/learn/',
            type: 'Learn'
        },
        {
            title: 'Emby Dev',
            url: 'https://dev.emby.media/xrefmap.yml',
            urlPrefix: 'https://dev.emby.media/',
            type: 'SDK Docs'
        }
    ];

    function unquote(value) {
        if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1).replace(/''/g, "'");
        }

        return value;
    }

    function parseXrefData(yaml, data, urlPrefix, type) {
        const lines = yaml.split('\n');

        let currentData;
        let property = '';
        let value = '';

        function addItem(item) {
            // DocFX adds an overload group entry (uid ending with '*') next to each member
            if (item && item.name && Object.keys(item).length > 0 && !item.uid.endsWith('*')) {
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
                const separator = line.indexOf(': ');
                property = line.substring(0, separator).trim();
                value = unquote(line.substring(separator + 2).trim());

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
                        currentData['type'] = 'SDK Ref';
                        break;
                }

            }
        });

        addItem(currentData);
    }

    function setDisplayType(item) {

        if (item.type === 'Documentation') {
            item.displayType = '';
        } else if (item.type === 'Learn') {
            item.displayType = 'Learn: ';
        } else if (item.type === 'SDK Docs') {
            item.displayType = 'SDK: ';
        } else if (item.type === 'SDK Ref') {
            item.displayType = 'SDK: ';
        } else {
            item.displayType = 'Emby ' + item.type + ': ';
        }
    }

    function loadSource(source) {
        if (!source.loading) {
            source.loading = fetch(source.url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to load ' + source.url + ': ' + response.status);
                    }
                    return response.text();
                })
                .then(yaml => {
                    const data = [];
                    parseXrefData(yaml, data, source.urlPrefix, source.type);
                    source.data = data;
                })
                .catch(error => {
                    source.loading = null;
                    throw error;
                });
        }

        return source.loading;
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
                        // Will look for at least two '#' characters followed by a search term
                        match = left.match(/(#{2,})[a-zA-Z\d-.]*$/);

                    if (!match || match[1].length > sources.length + 1) {
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

                    const hashCount = matchInfo.query.match(/^#+/)[0].length;
                    const source = sources[hashCount - 2];
                    const nextSource = sources[hashCount - 1];
                    const query = matchInfo.query.substring(hashCount);

                    function show(items, message) {
                        callback(items, {
                            header: source.title,
                            message: message,
                            footer: nextSource ? "Type '#' again for " + nextSource.title + ' content' : ''
                        });
                    }

                    function simpleSearch(searchStr) {
                        if (searchStr.length === 0) {
                            let suggestions1 = [];
                            for (let i = 0; i < maxResults && i < source.data.length; i++) {
                                setDisplayType(source.data[i]);
                                suggestions1.push(source.data[i]);
                            }
                            show(suggestions1);
                            return;
                        }

                        let suggestions = [];
                        for (let i = 0; i < source.data.length && suggestions.length < maxResults; i++) {
                            if (String(source.data[i].search).indexOf(searchStr.toLowerCase()) !== -1) {
                                setDisplayType(source.data[i]);
                                suggestions.push(source.data[i]);
                            }
                        }
                        show(suggestions);
                    }

                    if (source.data) {
                        simpleSearch(query);
                        return;
                    }

                    show([], 'Loading...');

                    loadSource(source).then(() => simpleSearch(query), error => {
                        console.error(error);
                        show([], 'Failed to load content');
                    });
                }

                config.dataCallback = dataCallback;

                // Define the templates of the autocomplete suggestions dropdown and output text.
                config.itemTemplate = '<li data-id="{id}" title="{type}: {name}">{type}: {name}</li>';
                config.outputTemplate = '<a href="{href}">{displayType}{name}</a> ';

                // Attach autocomplete to the editor.
                new CKEDITOR.plugins.autocomplete(editor, config);
            });
        }
    });

})();