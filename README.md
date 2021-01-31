# Mapnificent

Install [yarn](https://yarnpkg.com/) and [jekyll](https://jekyllrb.com/).

    # You need yarn and npm (see https://yarnpkg.com/en/docs/install/)
    # You need ruby and bundler
    bundle install

Then get the cities data:

    git submodule init
    git submodule update

Then run:

    yarn install
    bundle exec jekyll serve -w


## How to add a city

In order to add a transit system to Mapnificent, [GTFS data](https://developers.google.com/transit/gtfs/) for that transit system needs to be available without charge under a license that allows its use with Mapnificent. If you find data for a city that is not on Mapnificent, [please follow the steps outlined in the Mapnificent City repository.](https://github.com/mapnificent/mapnificent_cities/blob/master/README.md)
